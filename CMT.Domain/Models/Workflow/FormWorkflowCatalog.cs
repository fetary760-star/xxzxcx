using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v15 - FormWorkflowCatalog.cs   (THE CORE / AGGREGATOR PART)
    // Copy to: CMT.Domain/Models/Workflow/FormWorkflowCatalog.cs   (REPLACES the v9 file)
    //
    // ============================ WHY v15 WAS NECESSARY ============================
    // WorkflowContracts.cs, ApprovalStatus.cs and RoleHierarchy.cs are already at v14 and
    // are self-consistent: the contract members (AllowsDelegatedReview,
    // DelegatedReviewRoles, DelegatedReviewRequiresComments, HasDelegatedReview), the two
    // action verbs (DelegatedReviewRequested = 16 / DelegatedReviewConfirmed = 17), the
    // status (PendingDelegatedReview = 31), the two permissions
    // (RequestDelegatedReview / ConfirmDelegatedReview) and the two role sets
    // (DelegatedReviewRequesterRoles / DelegatedReviewerRoles) all exist.
    //
    // THIS file, however, was still the v9/v12 copy, so the amendment was DECLARED but not
    // EXECUTABLE. Concretely, five gaps:
    //
    //  (1) NO TRANSITION API. Nothing answered "which status does the step move to when the
    //      Director requests a review?" and, more importantly, "which status does it come
    //      BACK to when the reviewer confirms?". The engine had to hard-code status 31 and
    //      then guess the return status, which is exactly how the printed signature block
    //      ends up stamping the wrong person. v15 adds
    //      StatusAfterDelegatedReviewRequested / StatusAfterDelegatedReviewConfirmed:
    //      the return status is DERIVED from the step itself (StepAt(...).Status), so the
    //      approver always resumes his OWN step and his OWN SignatureBlockType.
    //
    //  (2) IMPRECISE REVIEWER RESOLUTION. ApproverRolesFor(formType, status) unioned the
    //      reviewer pools of EVERY delegable step of the form. On MNT-918A that offered the
    //      Director step's departmental pool as the reviewer pool of the ECAA endorsement.
    //      v15 adds the ApproverRolesFor(formType, status, currentStepNo) overload, which
    //      returns the pool of the step that is actually parked.
    //
    //  (3) v14 ROLE LAYER IGNORED. CanRequestDelegatedReview only checked the step's
    //      EligibleRoles, so it never consulted RoleHierarchy.DelegatedReviewRequesterRoles,
    //      and CanActAsDelegatedReviewer never consulted
    //      RoleHierarchy.CanConfirmDelegatedReview. v15 applies both gates.
    //
    //  (4) NO REVIEW CONTENT RULE. "Once the employee COMPLETES the review and confirms it"
    //      is meaningless if the confirmation may be empty. v15 honours
    //      WorkflowStepDefinition.DelegatedReviewRequiresComments.
    //
    //  (5) Validate() DID NOT ENFORCE THE v14 HARD RULES, so a half-applied configuration
    //      shipped silently. v15 enforces:
    //        - an auto-generated form (Rev. Status MNT-1420, Task Card MNT-1420C) declares
    //          the drafting step and NOTHING else, and never a delegated review;
    //        - AllowsDelegatedReview = true with an EMPTY DelegatedReviewRoles pool is a
    //          misconfiguration (it silently disables the feature);
    //        - PendingDelegatedReview is a TRANSIENT EXCURSION and must never be a step's
    //          own Status (see NonRoutingStatuses);
    //        - a delegated-review step must own a SignatureBlockType, otherwise the
    //          approver's Name / Date / Signature cannot be stamped;
    //        - a delegated-review step must NOT also set AllowsDelegation = true: borrowing
    //          a reviewer and giving the approval away are mutually exclusive;
    //        - the reviewer pool must not contain the step's own approver role (self review);
    //        - every reviewer role must be able to CONFIRM and at least one approver role of
    //          the step must be able to REQUEST, otherwise the step is unreachable.
    //
    // WHAT IT STILL DOES (unchanged from v9)
    //   - aggregates every part file (Regulatory / Documentation / Training / Tools /
    //     Facility) into ONE immutable catalog;
    //   - exposes the lookup helpers the engine, the controllers and the Table Of Contents
    //     renderer need, so NO switch statement over form types is written anywhere else;
    //   - evaluates skip logic declaratively (manual / auto / regulatory date);
    //   - resolves the signature block from the executed steps.
    //
    // HARD RULES
    //   - Declarative only: no EF, no DbContext, no I/O, no JSON dependency.
    //   - Aggregation uses Lazy<T>, because static FIELD initialisation order ACROSS
    //     partial-class files is undefined in C#. Every part file exposes a METHOD.
    //   - ADDITIVE: every v9 member keeps its exact name, signature and behaviour, so no
    //     existing call site changes. Nothing in ApprovalStatus.cs / RoleHierarchy.cs /
    //     WorkflowContracts.cs is modified: this file only CONSUMES them.
    // =====================================================================================

    public static partial class FormWorkflowCatalog
    {
        // -------------------------------------------------------------------------------
        // AGGREGATION
        // -------------------------------------------------------------------------------

        private static readonly Lazy<FormWorkflowDefinition[]> AllForms =
            new(() => RegulatoryForms()
                .Concat(DocumentationForms())
                .Concat(TrainingForms())
                .Concat(ToolsForms())
                .Concat(FacilityForms())
                .OrderBy(f => ToCSections.OrderOf(f.Section))
                .ThenBy(f => f.Order)
                .ThenBy(f => f.FormNo, StringComparer.OrdinalIgnoreCase)
                .ToArray());

        private static readonly Lazy<Dictionary<string, FormWorkflowDefinition>> ByFormType =
            new(() => AllForms.Value
                .GroupBy(f => f.FormType, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase));

        /// <summary>Every declared form, ordered exactly as the Table Of Contents renders them.</summary>
        public static FormWorkflowDefinition[] All => AllForms.Value;

        /// <summary>Rows seeded into a folder Table Of Contents when the folder is created.</summary>
        public static FormWorkflowDefinition[] FolderTemplate() =>
            All.Where(f => f.IncludeInFolder).ToArray();

        /// <summary>Forms of one Table Of Contents section, in render order.</summary>
        public static FormWorkflowDefinition[] BySection(string sectionCode) =>
            All.Where(f => string.Equals(f.Section, sectionCode, StringComparison.OrdinalIgnoreCase))
               .OrderBy(f => f.Order)
               .ToArray();

        /// <summary>Form types that must be closed before a folder can be Completed.</summary>
        public static string[] MandatoryFormTypes() =>
            All.Where(f => f.IncludeInFolder && f.IsMandatory)
               .Select(f => f.FormType)
               .ToArray();

        /// <summary>
        /// Forms that must be complete before the supplied form may be submitted.
        /// The ATA record approval is checked separately by the form command handler.
        /// </summary>
        public static string[] PrerequisiteFormTypes(string? formType)
        {
            var parallelSections = new[]
            {
                ToCSections.Documentation,
                ToCSections.Training,
                ToCSections.Tools,
                ToCSections.Facility,
                ToCSections.Consumables
            };

            if (string.Equals(formType, FormNodeTypes.PeriodicSelfAudit, StringComparison.OrdinalIgnoreCase))
            {
                return All
                    .Where(f => f.IncludeInFolder
                        && parallelSections.Contains(f.Section, StringComparer.OrdinalIgnoreCase))
                    .Select(f => f.FormType)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }

            if (string.Equals(formType, FormNodeTypes.ConfirmationLetter, StringComparison.OrdinalIgnoreCase)
                || string.Equals(formType, FormNodeTypes.RequestLetter, StringComparison.OrdinalIgnoreCase))
                return new[] { FormNodeTypes.PeriodicSelfAudit };

            if (string.Equals(formType, FormNodeTypes.Form918FAA, StringComparison.OrdinalIgnoreCase)
                || string.Equals(formType, FormNodeTypes.Form918ACAA, StringComparison.OrdinalIgnoreCase))
                return new[] { FormNodeTypes.ConfirmationLetter, FormNodeTypes.RequestLetter };

            return Array.Empty<string>();
        }

        /// <summary>918 FAA -> 918A CAA style companions generated by a joint approval path.</summary>
        public static (string PrimaryFormType, string CompanionFormType)[] JointApprovalPairs() =>
            All.Where(f => !string.IsNullOrWhiteSpace(f.JointApprovalCompanionFormType))
               .Select(f => (f.FormType, f.JointApprovalCompanionFormType!))
               .ToArray();

        /// <summary>Forms carrying a validity window, used to seed ExpiryTracking rows.</summary>
        public static (string FormType, int ExpiryMonths)[] ExpiringFormTypes() =>
            All.Where(f => f.ExpiryMonths.HasValue)
               .Select(f => (f.FormType, f.ExpiryMonths!.Value))
               .ToArray();

        // -------------------------------------------------------------------------------
        // LOOKUP
        // -------------------------------------------------------------------------------

        public static bool TryGet(string? formType, out FormWorkflowDefinition definition)
        {
            definition = null!;
            if (string.IsNullOrWhiteSpace(formType)) return false;
            return ByFormType.Value.TryGetValue(formType.Trim(), out definition!);
        }

        /// <summary>The definition of a form type, or null when the type is not catalogued.</summary>
        public static FormWorkflowDefinition? Get(string? formType) =>
            TryGet(formType, out var definition) ? definition : null;

        public static bool IsCatalogued(string? formType) => TryGet(formType, out _);

        public static string FormNoOf(string? formType) => Get(formType)?.FormNo ?? string.Empty;

        public static string TitleOf(string? formType) => Get(formType)?.Title ?? (formType ?? string.Empty);

        public static string SectionOf(string? formType) => Get(formType)?.Section ?? string.Empty;

        // -------------------------------------------------------------------------------
        // DRAFTING RIGHTS
        // -------------------------------------------------------------------------------

        public static string[] DraftRolesFor(string? formType) =>
            Get(formType)?.DraftRoles ?? Array.Empty<string>();

        /// <summary>
        /// True when the role may create the draft of that form. Admin may always draft.
        /// Generated companions are never drafted manually.
        /// </summary>
        public static bool CanDraft(string? role, string? formType)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            var definition = Get(formType);
            if (definition is null) return false;
            if (definition.IsGeneratedByJointApproval) return false;

            return definition.DraftRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>Form types the role is allowed to draft.</summary>
        public static FormWorkflowDefinition[] DraftableForms(string? role) =>
            All.Where(f => CanDraft(role, f.FormType)).ToArray();

        public static WorkflowStepDefinition[] StepsFor(string? formType) =>
            Get(formType)?.Steps ?? Array.Empty<WorkflowStepDefinition>();

        public static WorkflowStepDefinition[] ApprovalStepsFor(string? formType) =>
            StepsFor(formType).Where(s => s.StepNo > 0).OrderBy(s => s.StepNo).ToArray();

        public static WorkflowStepDefinition? StepAt(string? formType, int stepNo) =>
            StepsFor(formType).FirstOrDefault(s => s.StepNo == stepNo);

        /// <summary>The first approval step (StepNo 1), i.e. where the record goes on submit.</summary>
        public static WorkflowStepDefinition? FirstApprovalStep(string? formType) =>
            ApprovalStepsFor(formType).FirstOrDefault();
        /// <summary>
        /// AMENDED v12: auto-generated forms close immediately; other forms use their first
        /// catalogued approval step or the legacy chain when they are not catalogued.
        /// </summary>
        public static ApprovalStatus FirstStatusAfterSubmit(string? formType)
        {
            // AMENDED v12: auto-generated forms (Rev. Status MNT-1420, Task Cards MNT-1420C)
            // have NO approval process and NO approver role - the instance closes on submit.
            var definition = Get(formType);
            if (definition is not null && definition.IsAutoGenerated)
                return ApprovalStatus.Approved;

            var step = FirstApprovalStep(formType);
            if (step is null) return RoleHierarchy.FirstStatusAfterSubmit();
            return step.RequiresManualAssignment ? ApprovalStatus.PendingAssignment : step.Status;
        }

        /// <summary>AMENDED v12: true when the form's data comes from an external system source.</summary>
        public static bool IsAutoGeneratedForm(string? formType) =>
            Get(formType)?.IsAutoGenerated == true;

        /// <summary>
        /// AMENDED v15: human readable name of the external system an auto-generated form is
        /// imported from. Empty when the form declares none. Rendered next to the
        /// "Auto-generated" badge of the Table Of Contents so a user understands why the form
        /// carries no approver.
        /// </summary>
        public static string AutoGeneratedSourceOf(string? formType) =>
            Get(formType)?.AutoGeneratedSource ?? string.Empty;

        /// <summary>
        /// AMENDED v15: true when the form requires NO approval action at all, i.e. it is
        /// auto-generated. Used by the Table Of Contents to hide the approver column and by
        /// the engine to close the instance on submit.
        /// </summary>
        public static bool RequiresNoApproval(string? formType) => IsAutoGeneratedForm(formType);

        /// <summary>AMENDED v15: every auto-generated form type, for the ToC badge query.</summary>
        public static string[] AutoGeneratedFormTypes() =>
            All.Where(f => f.IsAutoGenerated).Select(f => f.FormType).ToArray();

        /// <summary>The next step after <paramref name="currentStepNo"/>, or null when the form closes.</summary>
        public static WorkflowStepDefinition? NextStep(string? formType, int currentStepNo) =>
            ApprovalStepsFor(formType).FirstOrDefault(s => s.StepNo > currentStepNo);

        /// <summary>The previous step, used by "return for rework".</summary>
        public static WorkflowStepDefinition? PreviousStep(string? formType, int currentStepNo) =>
            StepsFor(formType).Where(s => s.StepNo < currentStepNo)
                              .OrderByDescending(s => s.StepNo)
                              .FirstOrDefault();

        public static WorkflowStepDefinition? LastStep(string? formType) =>
            ApprovalStepsFor(formType).LastOrDefault();

        public static bool IsLastStep(string? formType, int stepNo) =>
            LastStep(formType)?.StepNo == stepNo;

        /// <summary>Total number of approval steps, used by the progress dashboard.</summary>
        public static int ApprovalStepCount(string? formType) => ApprovalStepsFor(formType).Length;

        // -------------------------------------------------------------------------------
        // ROLE GATE
        // -------------------------------------------------------------------------------

        /// <summary>Roles allowed to execute one specific step of one specific form.</summary>
        public static string[] EligibleRolesFor(string? formType, int stepNo) =>
            StepAt(formType, stepNo)?.EligibleRoles ?? Array.Empty<string>();

        /// <summary>
        /// Roles allowed to act while a CATALOGUED form sits in <paramref name="status"/>.
        /// Falls back to RoleHierarchy.ApproverRolesFor(status) for non-catalogued types,
        /// so every legacy call site keeps working.
        ///
        /// AMENDED v15: when the CURRENT step number is known, prefer the precise overload
        /// <see cref="ApproverRolesFor(string, ApprovalStatus, int)"/>: this two-argument
        /// version has to union the reviewer pools of every delegable step of the form,
        /// which is imprecise on a form with more than one delegable step (MNT-918 /
        /// MNT-918A).
        /// </summary>
        public static string[] ApproverRolesFor(string? formType, ApprovalStatus status)
        {
            // While a step sits in PendingDelegatedReview the actors are the step's reviewer
            // pool; the approver gets the record back only after the reviewer confirms.
            if (status is ApprovalStatus.PendingDelegatedReview)
            {
                var reviewers = StepsFor(formType)
                    .Where(s => s.HasDelegatedReview)
                    .SelectMany(s => s.DelegatedReviewRoles)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                if (reviewers.Length > 0) return reviewers;
                return RoleHierarchy.ApproverRolesFor(status);
            }

            var steps = StepsFor(formType).Where(s => s.Status == status).ToArray();
            if (steps.Length == 0) return RoleHierarchy.ApproverRolesFor(status);

            return steps.SelectMany(s => s.EligibleRoles)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
        }

        /// <summary>
        /// AMENDED v15 - PRECISE role gate: the roles allowed to act on the instance given
        /// BOTH its status and the step it is parked on.
        ///
        /// This is the method the inbox / Table Of Contents read path should call, because it
        /// is the only one that resolves the delegated-review excursion correctly:
        ///   - status == PendingDelegatedReview -> the reviewer pool OF THAT STEP;
        ///   - any other status                 -> the eligible roles OF THAT STEP.
        /// It removes the v12 defect where a Documentation Clerk was offered as the reviewer
        /// of the MNT-918A ECAA endorsement merely because another step of the same form
        /// declared that pool.
        /// </summary>
        public static string[] ApproverRolesFor(string? formType, ApprovalStatus status, int currentStepNo)
        {
            if (status is ApprovalStatus.PendingDelegatedReview)
            {
                var reviewers = DelegatedReviewRolesFor(formType, currentStepNo);
                return reviewers.Length > 0
                    ? reviewers
                    : ApproverRolesFor(formType, status);
            }

            var step = StepAt(formType, currentStepNo);
            if (step is not null && step.Status == status && step.EligibleRoles.Length > 0)
                return step.EligibleRoles;

            return ApproverRolesFor(formType, status);
        }

        /// <summary>Role gate for a step. Admin always passes (same rule as RoleHierarchy.CanActOn).</summary>
        public static bool CanActOnStep(string? role, string? formType, int stepNo)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            return EligibleRolesFor(formType, stepNo)
                .Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>Roles allowed to ASSIGN / RE-ASSIGN the pending step.</summary>
        public static string[] AssignerRolesFor(string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            if (step is null) return Array.Empty<string>();
            return step.AssignerRoles.Length > 0 ? step.AssignerRoles : step.EligibleRoles;
        }

        public static bool CanAssignStep(string? role, string? formType, int stepNo)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            return AssignerRolesFor(formType, stepNo)
                .Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Delegation to lower-tier staff ("Shop Team Leaders can assign these to
        /// lower-tier staff if workload is high"): the step must allow it, the actor must
        /// be a delegation role, and the delegate must be strictly LESS senior.
        ///
        /// NOTE: this transfers the APPROVAL. The 918 / 918A / Training-Verification
        /// managers keep their approval and borrow only a REVIEWER, which is
        /// <see cref="CanRequestDelegatedReview"/>.
        /// </summary>
        public static bool CanDelegateStep(string? actorRole, string? delegateRole, string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            if (step is null || !step.AllowsDelegation) return false;

            var actor = RoleHierarchy.Normalize(actorRole);
            var target = RoleHierarchy.Normalize(delegateRole);
            if (actor is null || target is null) return false;
            if (actor == OrgRoles.Admin) return true;

            if (!RoleHierarchy.DelegationRoles.Contains(actor, StringComparer.OrdinalIgnoreCase))
                return false;

            return RoleHierarchy.RankOf(target) > RoleHierarchy.RankOf(actor);
        }

        // -------------------------------------------------------------------------------
        // DELEGATED REVIEW  (AMENDED v15 - the executable contract)
        //
        // "Senior management delegates a REVIEW assignment to a designated employee; once
        //  the employee completes the review and confirms it, the form routes back to the
        //  Director / ECAA / QA Manager / HR Manager / Documentation Team Leader for final
        //  approval, which dynamically displays the approver's name, date and signature."
        //
        // THE STATE MACHINE, in ONE place:
        //
        //   step.Status  --RequestDelegatedReview-->  PendingDelegatedReview (31)
        //                                             (SAME StepNo, approval NOT transferred)
        //                --ConfirmDelegatedReview-->  step.Status   (the approver resumes)
        //                --Approve---------------->  NextStep(...)?.Status ?? Approved
        //
        // Because the return status is DERIVED from the step, the approver always resumes
        // his own step and therefore his own SignatureBlockType. The reviewer owns no
        // SignatureBlockType at all, which is the structural reason the printed
        // "Approved by / Reviewed by / Endorsed by" line can never be stamped with the
        // reviewer's name.
        // -------------------------------------------------------------------------------

        /// <summary>
        /// AMENDED v15 - statuses that are a TRANSIENT EXCURSION of the current step rather
        /// than a step of their own. A catalogued step must never declare one of them as its
        /// WorkflowStepDefinition.Status; <see cref="Validate"/> enforces it.
        /// </summary>
        public static readonly ApprovalStatus[] NonRoutingStatuses =
        {
            ApprovalStatus.PendingDelegatedReview
        };

        /// <summary>AMENDED v15 - true when the status is a transient excursion of a step.</summary>
        public static bool IsNonRoutingStatus(ApprovalStatus status) =>
            Array.IndexOf(NonRoutingStatuses, status) >= 0;

        /// <summary>AMENDED v15 - true while the instance sits inside the delegated-review excursion.</summary>
        public static bool IsAwaitingDelegatedReview(ApprovalStatus status) =>
            ApprovalStatusInfo.IsAwaitingDelegatedReview(status);

        /// <summary>AMENDED v15 - the steps of a form whose approver may borrow a reviewer.</summary>
        public static WorkflowStepDefinition[] DelegatedReviewStepsFor(string? formType) =>
            StepsFor(formType).Where(s => s.HasDelegatedReview).OrderBy(s => s.StepNo).ToArray();

        /// <summary>AMENDED v15 - true when at least one step of the form supports a delegated review.</summary>
        public static bool SupportsDelegatedReview(string? formType) =>
            Get(formType)?.SupportsDelegatedReview == true;
        /// <summary>
        /// Roles the approver of a step may borrow as delegated reviewers.
        /// Empty when the step does not support a delegated review.
        /// </summary>
        public static string[] DelegatedReviewRolesFor(string? formType, int stepNo) =>
            StepAt(formType, stepNo) is { HasDelegatedReview: true } step
                ? step.DelegatedReviewRoles
                : Array.Empty<string>();

        /// <summary>
        /// True when the actor may send the step to a delegated reviewer WHILE KEEPING the
        /// approval authority. The reviewer only confirms findings.
        /// </summary>
        public static bool CanRequestDelegatedReview(string? actorRole, string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            if (step is null || !step.HasDelegatedReview) return false;

            var canonical = RoleHierarchy.Normalize(actorRole);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;
            if (!RoleHierarchy.CanRequestDelegatedReview(canonical)) return false;

            return EligibleRolesFor(formType, stepNo)
                .Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// True when the actor may act AS the delegated reviewer of the step and CONFIRM the
        /// review. The step's own pool wins, and the role must additionally be allowed to
        /// confirm at all (RoleHierarchy.DelegatedReviewerRoles /
        /// Permissions.ConfirmDelegatedReview).
        /// </summary>
        public static bool CanActAsDelegatedReviewer(string? role, string? formType, int stepNo)
        {
            var reviewers = DelegatedReviewRolesFor(formType, stepNo);
            if (reviewers.Length == 0) return false;

            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            if (!RoleHierarchy.CanConfirmDelegatedReview(canonical)) return false;

            return reviewers.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// AMENDED v15 - the status the instance takes when the approver REQUESTS a delegated
        /// review. The StepNo does NOT change: the approval stays exactly where it was.
        /// Returns the step's own status unchanged when the step does not support a
        /// delegated review, so a wrong call can never move the record.
        /// </summary>
        public static ApprovalStatus StatusAfterDelegatedReviewRequested(string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            if (step is null) return ApprovalStatus.Draft;
            return step.HasDelegatedReview ? ApprovalStatus.PendingDelegatedReview : step.Status;
        }

        /// <summary>
        /// AMENDED v15 - the status the instance RETURNS to when the delegated reviewer
        /// confirms: the step's OWN status, on the SAME StepNo. This single line is what
        /// guarantees the requirement "the form will route back to the Director, ECAA or QA
        /// Manager for final approval (which dynamically displays the approver's name, date
        /// and signature)" - the approver resumes his own step and therefore his own
        /// SignatureBlockType.
        /// </summary>
        public static ApprovalStatus StatusAfterDelegatedReviewConfirmed(string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            return step?.Status ?? ApprovalStatus.PendingDelegatedReview;
        }

        /// <summary>
        /// AMENDED v15 - the audit verb of the request transition. Distinct from
        /// WorkflowStepAction.Delegated, which means the APPROVAL itself was handed over.
        /// </summary>
        public static WorkflowStepAction DelegatedReviewRequestAction =>
            WorkflowStepAction.DelegatedReviewRequested;

        /// <summary>AMENDED v15 - the audit verb of the confirmation transition.</summary>
        public static WorkflowStepAction DelegatedReviewConfirmAction =>
            WorkflowStepAction.DelegatedReviewConfirmed;

        /// <summary>
        /// AMENDED v15 - the signature line the step stamps once the approver finally acts.
        /// Exposed next to the delegated-review API on purpose: it documents that the
        /// excursion never owns a signature line of its own.
        /// </summary>
        public static SignatureBlockType DelegatedReviewApproverSignature(string? formType, int stepNo) =>
            StepAt(formType, stepNo)?.Signature ?? SignatureBlockType.None;

        /// <summary>
        /// AMENDED v15 - true when the delegated reviewer must write a review comment before
        /// he may confirm ("once the employee COMPLETES the review and confirms it").
        /// </summary>
        public static bool DelegatedReviewRequiresComments(string? formType, int stepNo) =>
            StepAt(formType, stepNo) is { HasDelegatedReview: true } step
            && step.DelegatedReviewRequiresComments;

        /// <summary>
        /// AMENDED v15 - payload validation of the confirmation: an empty confirmation on a
        /// step that demands a finding is rejected declaratively, so no controller has to
        /// re-implement the rule.
        /// </summary>
        public static bool IsDelegatedReviewConfirmationValid(string? formType, int stepNo, string? comments) =>
            !DelegatedReviewRequiresComments(formType, stepNo)
            || !string.IsNullOrWhiteSpace(comments);

        /// <summary>Central unit that owns the step queue, or null when it is the originator's shop.</summary>
        public static string? AssignmentUnitFor(string? formType, int stepNo) =>
            StepAt(formType, stepNo)?.AssignmentUnit;

        // -------------------------------------------------------------------------------
        // SKIP LOGIC
        // -------------------------------------------------------------------------------

        /// <summary>
        /// AUTOMATIC skip ("auto-allocated based on form fields").
        /// <paramref name="formFields"/> is FormDataJson flattened to camelCase key -> raw
        /// string value by the engine, so this file stays JSON-free.
        /// </summary>
        public static bool ShouldAutoSkip(
            WorkflowStepDefinition? step,
            IReadOnlyDictionary<string, string?>? formFields)
        {
            if (step is null) return false;
            if (step.Skip is SkipMode.NotSkippable or SkipMode.Manual) return false;
            if (string.IsNullOrWhiteSpace(step.SkipConditionField)) return false;

            if (formFields is null || !formFields.TryGetValue(step.SkipConditionField!, out var raw))
                return step.SkipWhenFieldMissing;

            if (raw is null) return step.SkipWhenFieldMissing;

            return string.Equals(Canonicalise(raw), Canonicalise(step.SkipWhenValue),
                StringComparison.OrdinalIgnoreCase);
        }

        public static bool ShouldAutoSkip(
            string? formType,
            int stepNo,
            IReadOnlyDictionary<string, string?>? formFields) =>
            ShouldAutoSkip(StepAt(formType, stepNo), formFields);

        /// <summary>
        /// MANUAL skip ("conditional in-house steps can be dynamically skipped by the user").
        /// The step must be manually skippable AND the role must hold skip authority.
        /// </summary>
        public static bool CanSkipManually(string? role, string? formType, int stepNo)
        {
            var step = StepAt(formType, stepNo);
            if (step is null) return false;

            var manualAllowed = step.Skip is SkipMode.Manual
                or SkipMode.ManualOrAuto
                or SkipMode.RegulatoryDate;
            if (!manualAllowed) return false;

            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;
            if (canonical == OrgRoles.Admin) return true;

            return RoleHierarchy.CanSkipSteps(canonical);
        }

        /// <summary>
        /// The "Optional / May Skip Now" flag of the 918 / 918A regulatory forms:
        /// the step may be deferred only while the regulatory target date is in the future.
        /// A missing target date means "no date set yet", therefore still skippable.
        /// </summary>
        public static bool MaySkipByRegulatoryDate(
            WorkflowStepDefinition? step,
            DateTime? regulatoryTargetDate,
            DateTime utcNow)
        {
            if (step is null || step.Skip != SkipMode.RegulatoryDate) return false;
            if (!regulatoryTargetDate.HasValue) return true;
            return regulatoryTargetDate.Value.ToUniversalTime() > utcNow;
        }

        /// <summary>Whole-form "Optional / May Skip Now" flag (918 / 918A).</summary>
        public static bool MaySkipForm(string? formType, DateTime? regulatoryTargetDate, DateTime utcNow)
        {
            var definition = Get(formType);
            if (definition is null || !definition.IsOptionalByRegulatoryDate) return false;
            if (!regulatoryTargetDate.HasValue) return true;
            return regulatoryTargetDate.Value.ToUniversalTime() > utcNow;
        }

        private static string Canonicalise(string? value)
        {
            var trimmed = (value ?? string.Empty).Trim();
            return trimmed switch
            {
                "1" or "yes" or "Yes" or "YES" or "true" or "True" or "TRUE" => "true",
                "0" or "no" or "No" or "NO" or "false" or "False" or "FALSE" or "" => "false",
                _ => trimmed
            };
        }

        // -------------------------------------------------------------------------------
        // SIGNATURE BLOCK  (requirement #3: auto-filled Prepared / Reviewed / Approved by)
        // -------------------------------------------------------------------------------

        /// <summary>Signature line a step fills in on the printed form.</summary>
        public static SignatureBlockType SignatureOf(string? formType, int stepNo) =>
            StepAt(formType, stepNo)?.Signature ?? SignatureBlockType.None;

        /// <summary>The signature lines a form prints, in step order and without duplicates.</summary>
        public static SignatureBlockType[] SignatureLayoutOf(string? formType) =>
            StepsFor(formType)
                .OrderBy(s => s.StepNo)
                .Select(s => s.Signature)
                .Where(s => s != SignatureBlockType.None)
                .Distinct()
                .ToArray();

        /// <summary>Printed caption of a signature line, shared by the UI and the PDF report.</summary>
        public static string SignatureCaption(SignatureBlockType block) => block switch
        {
            SignatureBlockType.PreparedBy => "Prepared by",
            SignatureBlockType.ProcessedBy => "Processed by",
            SignatureBlockType.VerifiedBy => "Verified by",
            SignatureBlockType.ReviewedBy => "Reviewed by",
            SignatureBlockType.ApprovedBy => "Approved by",
            SignatureBlockType.IssuedBy => "Issued by",
            SignatureBlockType.SignedOffBy => "Signed off by",
            SignatureBlockType.EndorsedBy => "Endorsed by",
            _ => string.Empty
        };

        // -------------------------------------------------------------------------------
        // DIAGNOSTICS  (exposed by GET /api/workflow/catalog, and handy in unit tests)
        // -------------------------------------------------------------------------------

        /// <summary>Flat routing reference: one row per step of every catalogued form.</summary>
        public static IEnumerable<(string FormNo, string FormType, int StepNo, string Title,
            string Status, string Roles, string Signature, string Skip)> RoutingReference()
        {
            foreach (var form in All)
            {
                foreach (var step in form.Steps.OrderBy(s => s.StepNo))
                {
                    yield return (
                        form.FormNo,
                        form.FormType,
                        step.StepNo,
                        step.Title,
                        ApprovalStatusInfo.Label(step.Status),
                        step.EligibleRoles.Length == 0
                            ? "-"
                            : string.Join(" | ", step.EligibleRoles.Select(RoleHierarchy.Label)),
                        SignatureCaption(step.Signature),
                        step.Skip.ToString());
                }
            }
        }

        /// <summary>
        /// AMENDED v15 - one row per DELEGABLE-REVIEW step: which approver keeps the
        /// approval, which employees he may borrow as reviewers, and which signature line he
        /// still stamps afterwards. Served next to the routing reference so the amendment is
        /// auditable without reading code.
        /// </summary>
        public static IEnumerable<(string FormNo, string FormType, int StepNo, string Title,
            string ApproverRoles, string ReviewerRoles, string SignatureStampedByApprover,
            bool ReviewCommentsRequired)> DelegatedReviewReference()
        {
            foreach (var form in All)
            {
                foreach (var step in form.DelegatedReviewSteps.OrderBy(s => s.StepNo))
                {
                    yield return (
                        form.FormNo,
                        form.FormType,
                        step.StepNo,
                        step.Title,
                        string.Join(" | ", step.EligibleRoles.Select(RoleHierarchy.Label)),
                        string.Join(" | ", step.DelegatedReviewRoles.Select(RoleHierarchy.Label)),
                        SignatureCaption(step.Signature),
                        step.DelegatedReviewRequiresComments);
                }
            }
        }

        /// <summary>
        /// AMENDED v15 - one row per AUTO-GENERATED form: no approval process, no approver
        /// role, closed on submission. Drives the "Auto-generated" badge of the Table Of
        /// Contents.
        /// </summary>
        public static IEnumerable<(string FormNo, string FormType, string Section, string Source)>
            AutoGeneratedReference()
        {
            foreach (var form in All.Where(f => f.IsAutoGenerated))
            {
                yield return (
                    form.FormNo,
                    form.FormType,
                    ToCSections.TitleOf(form.Section),
                    string.IsNullOrWhiteSpace(form.AutoGeneratedSource)
                        ? "external source system"
                        : form.AutoGeneratedSource);
            }
        }

        /// <summary>
        /// Self-check used by a startup assertion / unit test: catches an invalid catalog
        /// (missing draft step, non-monotonic step numbers, unknown role, unknown section,
        /// dangling joint-approval companion) BEFORE it reaches production.
        ///
        /// AMENDED v15 - additionally enforces the auto-generated rules and the seven
        /// delegated-review rules, so neither amendment can be half-applied.
        /// </summary>
        public static IReadOnlyList<string> Validate()
        {
            var problems = new List<string>();
            var seenTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var form in All)
            {
                var id = string.IsNullOrWhiteSpace(form.FormNo) ? form.FormType : form.FormNo;

                if (string.IsNullOrWhiteSpace(form.FormType))
                    problems.Add($"{id}: FormType is empty.");
                else if (!seenTypes.Add(form.FormType))
                    problems.Add($"{id}: duplicate FormType '{form.FormType}'.");

                if (ToCSections.OrderOf(form.Section) == int.MaxValue)
                    problems.Add($"{id}: unknown ToC section '{form.Section}'.");

                if (form.DraftStep is null)
                    problems.Add($"{id}: no drafting step (StepNo 0).");

                // ---------- AMENDMENT ITEM 1: automated forms have NO approver ----------
                if (form.IsAutoGenerated)
                {
                    if (form.Steps.Length != 1)
                    {
                        problems.Add($"{id}: an auto-generated form has no approval process and no " +
                                     "approver role, so it must declare the drafting step (StepNo 0) " +
                                     $"and nothing else (found {form.Steps.Length} steps).");
                    }

                    if (form.SupportsDelegatedReview)
                    {
                        problems.Add($"{id}: an auto-generated form has no approver, therefore it " +
                                     "must not declare a delegated review.");
                    }

                    if (form.ExpiryMonths.HasValue && !form.IncludeInFolder)
                    {
                        // purely informational consistency note, never a blocker
                    }
                }
                else if (!form.ApprovalSteps.Any())
                {
                    problems.Add($"{id}: no approval step.");
                }

                var expected = 0;
                foreach (var step in form.Steps.OrderBy(s => s.StepNo))
                {
                    if (step.StepNo != expected)
                        problems.Add($"{id}: step numbers must be consecutive from 0 (found {step.StepNo}, expected {expected}).");
                    expected = step.StepNo + 1;

                    if (step.StepNo > 0 && step.EligibleRoles.Length == 0)
                        problems.Add($"{id} step {step.StepNo}: no eligible role.");

                    foreach (var role in step.EligibleRoles.Concat(step.AssignerRoles))
                    {
                        if (RoleHierarchy.Normalize(role) is null)
                            problems.Add($"{id} step {step.StepNo}: unknown role '{role}'.");
                    }

                    if (step.RequiresManualAssignment && step.AssignerRoles.Length == 0)
                        problems.Add($"{id} step {step.StepNo}: manual assignment without AssignerRoles.");

                    if (step.Skip is SkipMode.Auto or SkipMode.ManualOrAuto
                        && string.IsNullOrWhiteSpace(step.SkipConditionField))
                        problems.Add($"{id} step {step.StepNo}: automatic skip without SkipConditionField.");

                    // ---------- AMENDMENT ITEM 2 / 3: delegated review integrity ----------

                    // (a) a transient excursion is never a step of its own.
                    if (IsNonRoutingStatus(step.Status))
                    {
                        problems.Add($"{id} step {step.StepNo}: " +
                                     $"'{ApprovalStatusInfo.Label(step.Status)}' is a transient excursion " +
                                     "of a step and must never be declared as a step's own Status.");
                    }

                    // (b) enabled capability with an empty pool silently disables the feature.
                    if (step.AllowsDelegatedReview && step.DelegatedReviewRoles.Length == 0)
                    {
                        problems.Add($"{id} step {step.StepNo}: AllowsDelegatedReview is true but " +
                                     "DelegatedReviewRoles is empty, which silently disables the " +
                                     "delegated review. Declare the reviewer pool.");
                    }

                    if (step.HasDelegatedReview)
                    {
                        // (c) borrowing a reviewer and giving the approval away are exclusive.
                        if (step.AllowsDelegation)
                        {
                            problems.Add($"{id} step {step.StepNo}: a delegated-review step must set " +
                                         "AllowsDelegation = false - the approval stays with the " +
                                         "approver, only a reviewer is borrowed.");
                        }

                        // (d) without a signature line the approver cannot be stamped.
                        if (step.Signature == SignatureBlockType.None)
                        {
                            problems.Add($"{id} step {step.StepNo}: a delegated-review step must own a " +
                                         "signature block, otherwise the approver's name, date and " +
                                         "signature cannot be displayed after the review returns.");
                        }

                        // (e) at least one approver of the step must be able to REQUEST a review.
                        if (!step.EligibleRoles.Any(RoleHierarchy.CanRequestDelegatedReview))
                        {
                            problems.Add($"{id} step {step.StepNo}: none of its eligible roles may " +
                                         "request a delegated review, so the step could never enter " +
                                         "the review state.");
                        }

                        // (f) / (g) the reviewer pool must be usable and must not self-review.
                        foreach (var role in step.DelegatedReviewRoles)
                        {
                            var canonical = RoleHierarchy.Normalize(role);
                            if (canonical is null)
                            {
                                problems.Add($"{id} step {step.StepNo}: unknown delegated-review role '{role}'.");
                                continue;
                            }

                            if (!RoleHierarchy.CanConfirmDelegatedReview(canonical))
                            {
                                problems.Add($"{id} step {step.StepNo}: {RoleHierarchy.Label(canonical)} " +
                                             "is declared as a reviewer but may not confirm a delegated " +
                                             "review, so the record would stay stuck in " +
                                             $"'{ApprovalStatusInfo.Label(ApprovalStatus.PendingDelegatedReview)}'.");
                            }

                            if (step.EligibleRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase))
                            {
                                problems.Add($"{id} step {step.StepNo}: {RoleHierarchy.Label(canonical)} " +
                                             "is both the approver and the delegated reviewer of the " +
                                             "same step (self review).");
                            }
                        }
                    }
                }

                foreach (var role in form.DraftRoles)
                {
                    if (RoleHierarchy.Normalize(role) is null)
                        problems.Add($"{id}: unknown draft role '{role}'.");
                }

                if (!string.IsNullOrWhiteSpace(form.JointApprovalCompanionFormType)
                    && !IsCatalogued(form.JointApprovalCompanionFormType))
                {
                    problems.Add($"{id}: joint approval companion '{form.JointApprovalCompanionFormType}' is not catalogued.");
                }
            }

            return problems;
        }
    }
}