using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v14 - WorkflowContracts.cs   (AMENDMENT OF THE EXISTING v11/v12 FILE)
    //
    // ============================ WHAT v14 CHANGES ============================
    // v12 declared the two delegated-review members on WorkflowStepDefinition
    // (AllowsDelegatedReview / DelegatedReviewRoles) but the CONTRACT was still incomplete,
    // which is why the feature could be declared yet never executed end to end:
    //
    //   (1) WorkflowStepAction had no verb for the two new transitions. The audit log could
    //       record neither "the Director sent step 1 to a reviewer" nor "the reviewer
    //       confirmed", so WorkflowAuditLog / FormWorkflowStep.ActionTaken had to reuse
    //       'Delegated' (which means the APPROVAL was handed over - the opposite of the
    //       requirement) or 'Reviewed' (which is the approver's own review verb).
    //       -> v14 appends DelegatedReviewRequested = 16 and DelegatedReviewConfirmed = 17.
    //          Nothing is renumbered.
    //
    //   (2) A delegated review whose reviewer writes nothing is worthless: the whole point
    //       of the requirement is that "the employee completes the review and confirms it".
    //       -> v14 adds WorkflowStepDefinition.DelegatedReviewRequiresComments (default true)
    //          so the engine can reject an empty confirmation declaratively.
    //
    //   (3) There was no way to ask a step "do you actually have a usable reviewer pool?".
    //       AllowsDelegatedReview = true with an EMPTY DelegatedReviewRoles array is a
    //       misconfiguration that silently disables the feature (see
    //       FormWorkflowCatalog.CanRequestDelegatedReview, which returns false in that
    //       case). -> v14 adds the computed WorkflowStepDefinition.HasDelegatedReview and
    //       FormWorkflowCatalog.Validate() now reports the misconfiguration.
    //
    //   (4) WorkflowRoleSets had no single-role reviewer pools for the Documentation and the
    //       ECAA cases, so a catalog part file had to inline a new array (and therefore
    //       invent vocabulary). -> v14 adds DocumentationClerkOnly and EcaaOnly.
    //
    // WHY THIS IS SAFE
    //   - Every addition is either a NEW enum member appended at the end, or an `init`-only
    //     property with a default, so EVERY existing object initialiser in
    //     FormWorkflowCatalog.Regulatory.cs / .Documentation.cs / .Training.cs / .Tools.cs /
    //     .Facility.cs keeps compiling untouched.
    //   - These are DECLARATIVE POCOs, not EF entities: they are never mapped, so this
    //     change produces NO schema difference and NO migration on its own.
    //   - No enum member, no status, no role and no existing property is renamed,
    //     renumbered or removed.
    //
    // ============================ WHAT v11 ALREADY FIXED ============================
    //   FormWorkflowDefinition.RequiredDraftFields and WorkflowStepDefinition.RequiredFields
    //   were referenced by FormWorkflowCatalog.Documentation.cs (v10) and by
    //   DocumentationPermissionMatrix.cs but never declared, which produced the 12
    //   CS0117 / CS1061 build errors. Both are declared below, unchanged.
    // =====================================================================================

    /// <summary>
    /// What a step is functionally. Drives the action verb the UI renders
    /// ("Assign clerk", "Verify", "Approve", "Sign off", "Endorse", "Skip").
    /// </summary>
    public enum WorkflowStepKind
    {
        /// <summary>Step 0. The originator is preparing the form.</summary>
        Draft = 0,

        /// <summary>A human must pick the assignee before work can start.</summary>
        Assignment = 1,

        /// <summary>Data entry / processing by a clerk or an engineer.</summary>
        Processing = 2,

        /// <summary>Verification of facts (HR training status, CMM status).</summary>
        Verification = 3,

        /// <summary>Technical review, not yet the final approval.</summary>
        Review = 4,

        /// <summary>Approval stage of a management tier.</summary>
        Approval = 5,

        /// <summary>Legally binding signature that closes the form.</summary>
        SignOff = 6,

        /// <summary>Conditional step that may be skipped or auto-allocated.</summary>
        Conditional = 7,

        /// <summary>Authority endorsement (ECAA Team on MNT-918A).</summary>
        Endorsement = 8,

        /// <summary>MNT-1325 step-by-step check that gates the final release.</summary>
        Gate = 9
    }

    /// <summary>
    /// Which signature line of the printed form this step fills in.
    /// Requirement #3: "every form's 'Prepared by / Reviewed by / Approved by / Dates'
    /// block is auto-filled from the executed steps".
    ///
    /// AMENDED v14 - NOTE: a delegated reviewer is deliberately given NO member of this enum.
    /// The 918 / 918A form templates have no printed "Reviewer" section, so the delegated
    /// review is a STATE, not a signature line. This is the structural reason the printed
    /// "Approved by" block keeps rendering the approver's Name / Date / Signature.
    /// </summary>
    public enum SignatureBlockType
    {
        None = 0,
        PreparedBy = 1,
        ProcessedBy = 2,
        VerifiedBy = 3,
        ReviewedBy = 4,
        ApprovedBy = 5,
        IssuedBy = 6,
        SignedOffBy = 7,
        EndorsedBy = 8
    }

    /// <summary>
    /// Action recorded on an executed step. Persisted on FormWorkflowStep.ActionTaken
    /// and mirrored into WorkflowAuditLog. Complements the existing
    /// CMT.Domain.Models.Shared.WorkflowAction enum (which stays untouched) with the
    /// step-level verbs the matrix needs (Assigned / Skipped / Returned / Endorsed).
    /// </summary>
    public enum WorkflowStepAction
    {
        None = 0,
        Created = 1,
        Submitted = 2,
        Assigned = 3,
        Reassigned = 4,

        /// <summary>The APPROVAL itself was handed to a lower tier (Permissions.DelegateForm).</summary>
        Delegated = 5,

        Verified = 6,
        Reviewed = 7,
        Approved = 8,
        Rejected = 9,
        Returned = 10,
        Skipped = 11,
        SignedOff = 12,
        Endorsed = 13,
        Amended = 14,
        Reopened = 15,

        /// <summary>
        /// AMENDED v14 - the step's own approver (Director / QA Manager / ECAA Team /
        /// HR Manager / Documentation Team Leader) sent the step to a delegated reviewer and
        /// KEPT the approval. The instance moves to ApprovalStatus.PendingDelegatedReview
        /// WITHOUT changing StepNo.
        /// </summary>
        DelegatedReviewRequested = 16,

        /// <summary>
        /// AMENDED v14 - the delegated reviewer confirmed the review. The instance returns to
        /// the SAME StepNo and to that step's own Status, so the original approver performs
        /// the final approval and the signature block stamps HIM.
        /// </summary>
        DelegatedReviewConfirmed = 17
    }

    /// <summary>How a step may legitimately be bypassed (skip logic).</summary>
    public enum SkipMode
    {
        NotSkippable = 0,

        /// <summary>A user holding Permissions.SkipFormStep presses "Skip now".</summary>
        Manual = 1,

        /// <summary>Auto-allocated / auto-skipped from a form field value.</summary>
        Auto = 2,

        /// <summary>Both manual and automatic skipping are allowed.</summary>
        ManualOrAuto = 3,

        /// <summary>
        /// "Optional / May Skip Now" flag driven by a regulatory target date
        /// (918 / 918A). Skippable until the target date is reached.
        /// </summary>
        RegulatoryDate = 4
    }

    /// <summary>
    /// The Table of Contents sections of the Self-Evaluation folder, in render order.
    /// Requirement #2: render the existing ToC with live per-form status.
    /// </summary>
    public static class ToCSections
    {
        public const string SelfAudit = "PERIODIC_CAPABILITY_SELF_AUDIT";
        public const string LetterOfConfirmation = "LETTER_OF_CONFIRMATION";
        public const string AmendmentRequest = "AMENDMENT_REQUEST";
        public const string Form918FAA = "918_FAA";
        public const string Form918ACAA = "918A_CAA";
        public const string Documentation = "DOCUMENTATION";
        public const string Training = "TRAINING_DOCUMENT";
        public const string Tools = "TOOLS_AND_EQUIPMENT";
        public const string Facility = "FACILITY_REQUIREMENT_EVALUATION";
        public const string Consumables = "CONSUMABLES";
        public const string FinalSignOff = "FINAL_SIGN_OFF";

        /// <summary>Section code -> printed title + order, exactly as the ToC lists them.</summary>
        public static readonly (string Code, string Title, int Order)[] Ordered =
        {
            (SelfAudit,            "PERIODIC CAPABILITY SELF-AUDIT (MNT-1325)", 1),
            (LetterOfConfirmation, "LETTER OF CONFIRMATION",                    2),
            (AmendmentRequest,     "AMENDMENT REQUEST",                         3),
            (Form918FAA,           "918 FAA",                                   4),
            (Form918ACAA,          "918 A CAA",                                 5),
            (Documentation,        "DOCUMENTATION",                             6),
            (Training,             "TRAINING DOCUMENT",                         7),
            (Tools,                "TOOLS AND EQUIPMENT",                       8),
            (Facility,             "FACILITY REQUIREMENT EVALUATION",           9),
            (Consumables,          "CONSUMABLES",                              10),
            (FinalSignOff,         "FINAL SIGN-OFF",                           11)
        };

        public static string TitleOf(string? code)
        {
            var hit = Ordered.FirstOrDefault(s =>
                string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase));
            return hit.Code is null ? (code ?? string.Empty) : hit.Title;
        }

        public static int OrderOf(string? code)
        {
            var hit = Ordered.FirstOrDefault(s =>
                string.Equals(s.Code, code, StringComparison.OrdinalIgnoreCase));
            return hit.Code is null ? int.MaxValue : hit.Order;
        }
    }

    /// <summary>
    /// ONE ROW of a form's step table. Persisted 1:1 into FormWorkflowStep when the
    /// instance is created, so the executed chain stays auditable even if the catalog
    /// is revised later (two-year revision cycle, requirement #12).
    /// </summary>
    public sealed class WorkflowStepDefinition
    {
        /// <summary>0 = the drafting step. Steps execute in ascending order.</summary>
        public int StepNo { get; init; }

        public string Title { get; init; } = string.Empty;

        /// <summary>Status the record sits in WHILE this step is pending.</summary>
        public ApprovalStatus Status { get; init; }

        public WorkflowStepKind Kind { get; init; } = WorkflowStepKind.Approval;

        /// <summary>
        /// Canonical OrgRoles allowed to execute the step. Admin may always act
        /// (RoleHierarchy.CanActOn already returns true for Admin).
        /// </summary>
        public string[] EligibleRoles { get; init; } = Array.Empty<string>();

        /// <summary>Signature line filled from the executed step.</summary>
        public SignatureBlockType Signature { get; init; } = SignatureBlockType.None;

        /// <summary>
        /// True when a human must pick the assignee:
        ///   - STL -> designated Certifying Staff (New ATA Record),
        ///   - DL  -> available Documentation Clerk (MNT-1420A),
        ///   - STL -> Engineer (TNA MNT-1229B),
        ///   - STL -> designated Inspector (MNT-1378) / Technician (MNT-922C).
        /// The engine parks the record in ApprovalStatus.PendingAssignment until assigned.
        /// </summary>
        public bool RequiresManualAssignment { get; init; }

        /// <summary>Roles allowed to perform that manual assignment / re-assignment.</summary>
        public string[] AssignerRoles { get; init; } = Array.Empty<string>();

        /// <summary>
        /// Central unit owning the queue (FunctionalUnits.Documentation /
        /// FunctionalUnits.HumanResources). Null = the originator's shop.
        /// </summary>
        public string? AssignmentUnit { get; init; }

        public SkipMode Skip { get; init; } = SkipMode.NotSkippable;

        /// <summary>camelCase key inside FormDataJson driving the automatic skip.</summary>
        public string? SkipConditionField { get; init; }

        /// <summary>Value of SkipConditionField that means "skip this step".</summary>
        public string SkipWhenValue { get; init; } = "false";

        /// <summary>Skip when the field is absent from the payload (default true).</summary>
        public bool SkipWhenFieldMissing { get; init; } = true;

        /// <summary>Reason stored on the step when it is skipped automatically.</summary>
        public string? SkipReasonTemplate { get; init; }

        /// <summary>
        /// The actor must belong to the originator's shop. Enforces
        /// "Shop Team Leader enrols all employees belonging to his shop only".
        /// </summary>
        public bool RestrictToOriginatorShop { get; init; }

        /// <summary>
        /// Step may be delegated / re-assigned to lower-tier staff of the same shop
        /// ("Shop Team Leaders can assign these to lower-tier staff if workload is high").
        ///
        /// IMPORTANT: this transfers the APPROVAL. A step whose approver must keep the
        /// approval (918 / 918A Director, QA Manager, ECAA Team; HR Manager on the training
        /// verification forms) MUST set this to false and use AllowsDelegatedReview instead.
        /// </summary>
        public bool AllowsDelegation { get; init; } = true;

        /// <summary>
        /// AMENDED v12 - "the system must allow these managers to delegate a review
        /// assignment to a designated employee ... once the employee completes the review
        /// and confirms it, the form routes back to the Director / ECAA / QA Manager for
        /// final approval". Distinct from AllowsDelegation (which hands the APPROVAL
        /// itself over): with a delegated review the approver KEEPS the approval step and
        /// only borrows a reviewer - the printed "Approved by" line still shows the
        /// manager's name, date and signature.
        /// </summary>
        public bool AllowsDelegatedReview { get; init; }

        /// <summary>
        /// AMENDED v12 - canonical roles eligible to act as the delegated reviewer of
        /// this step.
        ///
        /// AMENDED v14 - an EMPTY array combined with AllowsDelegatedReview = true is a
        /// MISCONFIGURATION, not "anyone may review": FormWorkflowCatalog.
        /// CanRequestDelegatedReview returns false in that case, which silently disables the
        /// feature. FormWorkflowCatalog.Validate() now reports it.
        /// </summary>
        public string[] DelegatedReviewRoles { get; init; } = Array.Empty<string>();

        /// <summary>
        /// AMENDED v14 - the delegated reviewer must write a review comment before he may
        /// confirm. Default true: "once the employee COMPLETES the review and confirms it"
        /// is meaningless if the confirmation carries no finding. Set to false only for a
        /// pure acknowledgement step.
        /// </summary>
        public bool DelegatedReviewRequiresComments { get; init; } = true;

        /// <summary>
        /// AMENDED v14 - true when the step really can send work to a delegated reviewer,
        /// i.e. the capability is enabled AND a reviewer pool was declared.
        /// </summary>
        public bool HasDelegatedReview =>
            AllowsDelegatedReview && DelegatedReviewRoles.Length > 0;

        /// <summary>Comments are mandatory (gate findings, rejection reason).</summary>
        public bool RequiresComments { get; init; }

        /// <summary>MNT-1325: iterate the checklist item by item; no bulk approve.</summary>
        public bool IsStepByStepChecklist { get; init; }

        /// <summary>
        /// AMENDED v11 - FormDataJson keys that must be supplied before this step can be
        /// completed. Empty when the step imposes no field requirement. NEVER null.
        ///
        /// Consumed by:
        ///   - FormWorkflowCatalog.RequiredFieldsForStep(formType, stepNo)
        ///   - FormWorkflowCatalog.MissingRequiredFields(...)
        ///   - DocumentationPermissionMatrix.NotesFor(step)
        /// </summary>
        public string[] RequiredFields { get; init; } = Array.Empty<string>();
    }

    /// <summary>
    /// Full definition of ONE form: identity, its placement in the Table of Contents,
    /// who may draft it, and its ordered step table.
    /// </summary>
    public sealed class FormWorkflowDefinition
    {
        /// <summary>FormNodeTypes constant. Also the value of FormSubmission.FormType.</summary>
        public string FormType { get; init; } = string.Empty;

        /// <summary>Printed form number, e.g. "MNT-1420A".</summary>
        public string FormNo { get; init; } = string.Empty;

        public string Title { get; init; } = string.Empty;

        /// <summary>ToCSections code.</summary>
        public string Section { get; init; } = string.Empty;

        /// <summary>Order inside the section.</summary>
        public int Order { get; init; }

        /// <summary>Roles allowed to CREATE the draft.</summary>
        public string[] DraftRoles { get; init; } = Array.Empty<string>();

        public WorkflowStepDefinition[] Steps { get; init; } = Array.Empty<WorkflowStepDefinition>();

        /// <summary>
        /// AMENDED v11 - FormDataJson keys required before the draft may be submitted.
        /// Empty when the form imposes no draft-time field requirement. NEVER null.
        /// </summary>
        public string[] RequiredDraftFields { get; init; } = Array.Empty<string>();

        /// <summary>Seeded into the folder Table of Contents when a folder is created.</summary>
        public bool IncludeInFolder { get; init; } = true;

        /// <summary>The folder cannot be completed while this form is still open.</summary>
        public bool IsMandatory { get; init; } = true;

        /// <summary>Whole form may be flagged "Optional / May Skip Now" (918 / 918A).</summary>
        public bool IsOptionalByRegulatoryDate { get; init; }

        /// <summary>
        /// Companion form auto-generated when the joint approval path is enabled
        /// (918 FAA -> 918A CAA).
        /// </summary>
        public string? JointApprovalCompanionFormType { get; init; }

        /// <summary>The form is generated by the joint path, never drafted manually.</summary>
        public bool IsGeneratedByJointApproval { get; init; }

        /// <summary>
        /// AMENDED v12 - the form's data is auto-generated from an external system source
        /// (Rev. Status / CMM revision rows, Task Cards). It therefore has NO approval
        /// process and NO approver role: the instance closes on submit
        /// (FormWorkflowCatalog.FirstStatusAfterSubmit returns Approved).
        ///
        /// AMENDED v14 - such a form MUST declare the drafting step (StepNo 0) and NOTHING
        /// else, and it MUST NOT declare a delegated review. FormWorkflowCatalog.Validate()
        /// now enforces both, so "no approver required" cannot be half-applied.
        /// </summary>
        public bool IsAutoGenerated { get; init; }

        /// <summary>
        /// AMENDED v14 - human readable name of the external system the rows come from
        /// (e.g. "CMM / technical-data source system", "MaintainX"). Rendered next to the
        /// "Auto-generated" badge in the Table Of Contents so a user understands why the form
        /// has no approver. Optional and purely informational.
        /// </summary>
        public string AutoGeneratedSource { get; init; } = string.Empty;

        /// <summary>
        /// Validity in months, drives ExpiryTracking rows:
        /// training verification 24, periodic self-audit 12, tool calibration 12.
        /// </summary>
        public int? ExpiryMonths { get; init; }

        /// <summary>MNT-1325: presented step-by-step before the final release.</summary>
        public bool IsFinalReleaseGate { get; init; }

        /// <summary>Lower tiers are bypassed by design (MNT-918 goes straight to DIR).</summary>
        public bool BypassesLowerTiers { get; init; }

        /// <summary>Remark rendered next to the form in the Table of Contents.</summary>
        public string Remarks { get; init; } = string.Empty;

        /// <summary>Convenience: the drafting step (StepNo 0).</summary>
        public WorkflowStepDefinition? DraftStep => Steps.FirstOrDefault(s => s.StepNo == 0);

        /// <summary>Convenience: the approval steps, drafting excluded.</summary>
        public IEnumerable<WorkflowStepDefinition> ApprovalSteps => Steps.Where(s => s.StepNo > 0);

        /// <summary>AMENDED v14 - the steps whose approver may borrow a delegated reviewer.</summary>
        public IEnumerable<WorkflowStepDefinition> DelegatedReviewSteps =>
            Steps.Where(s => s.HasDelegatedReview);

        /// <summary>AMENDED v14 - true when at least one step supports a delegated review.</summary>
        public bool SupportsDelegatedReview => Steps.Any(s => s.HasDelegatedReview);
    }

    /// <summary>
    /// Reusable role sets, so every catalog part file speaks the same vocabulary and a
    /// routing change is made in ONE place. All values come from OrgRoles: no new role
    /// names are invented here.
    /// </summary>
    internal static class WorkflowRoleSets
    {
        internal static readonly string[] StlOnly = { OrgRoles.TeamLeader };
        internal static readonly string[] StlOrEng = { OrgRoles.TeamLeader, OrgRoles.Engineer };
        internal static readonly string[] StlEngShopMgr =
            { OrgRoles.TeamLeader, OrgRoles.Engineer, OrgRoles.ShopManager };
        internal static readonly string[] ShopLeadership =
            { OrgRoles.TeamLeader, OrgRoles.ShopManager };

        /// <summary>Who may assign / re-assign inside a shop (incl. Special TL direct action).</summary>
        internal static readonly string[] StlAssigners =
            { OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.SpecialTeamLeader };

        internal static readonly string[] CertifyingStaff = { OrgRoles.CertifyingStaff };
        internal static readonly string[] Engineer = { OrgRoles.Engineer };
        internal static readonly string[] SpecialTl = { OrgRoles.SpecialTeamLeader };
        internal static readonly string[] ManagerOnly = { OrgRoles.Manager };
        internal static readonly string[] ManagerOrShopMgr = { OrgRoles.Manager, OrgRoles.ShopManager };
        internal static readonly string[] Director = { OrgRoles.Director };
        internal static readonly string[] Qa = { OrgRoles.QAPersonnel };
        internal static readonly string[] Ecaa = { OrgRoles.ECAAPersonnel };
        internal static readonly string[] Dl = { OrgRoles.DocumentationTeamLeader };
        internal static readonly string[] Clerk = { OrgRoles.DocumentationClerk };
        internal static readonly string[] HrSpecialist = { OrgRoles.HRSpecialist, OrgRoles.HRManager };
        internal static readonly string[] HrManager = { OrgRoles.HRManager };
        internal static readonly string[] InspectorOnly = { OrgRoles.Inspector };
        internal static readonly string[] TechnicianOnly = { OrgRoles.Technician };

        /// <summary>
        /// AMENDED v12 - department employees a Director / QA Manager may pick as the
        /// delegated reviewer of the 918 forms ("a designated employee in their
        /// department").
        /// </summary>
        internal static readonly string[] DeptEmployees =
        {
            OrgRoles.Manager, OrgRoles.ShopManager, OrgRoles.TeamLeader,
            OrgRoles.Engineer, OrgRoles.CertifyingStaff, OrgRoles.Inspector, OrgRoles.Technician
        };

        /// <summary>AMENDED v12 - reviewer pool the ECAA Team may delegate a 918A review to.</summary>
        internal static readonly string[] EcaaReviewPool =
        {
            OrgRoles.QAPersonnel, OrgRoles.CertifyingStaff, OrgRoles.Engineer, OrgRoles.Inspector
        };

        /// <summary>AMENDED v12 - HR Specialist only (the existing HrSpecialist set also contains the HR Manager).</summary>
        internal static readonly string[] HrSpecialistOnly = { OrgRoles.HRSpecialist };

        /// <summary>
        /// AMENDED v14 - Documentation Clerk only, as the reviewer pool of the
        /// MNT-1420A Documentation Team Leader sign-off step: "the system should allow the
        /// Team Leader to assign the form to a Documentation Clerk for review. Once confirmed
        /// by the clerk, the Documentation Team Leader will issue final approval."
        /// (The existing 'Clerk' set is the EXECUTOR pool of the clerk PROCESSING step; a
        /// separate name keeps the two intents distinguishable at the call site.)
        /// </summary>
        internal static readonly string[] DocumentationClerkOnly = { OrgRoles.DocumentationClerk };

        /// <summary>AMENDED v14 - ECAA Team only, for symmetry with the other single-role sets.</summary>
        internal static readonly string[] EcaaOnly = { OrgRoles.ECAAPersonnel };

        /// <summary>Actors of the MNT-1325 step-by-step gate.</summary>
        internal static readonly string[] SelfAuditActors =
            { OrgRoles.QAPersonnel, OrgRoles.TeamLeader, OrgRoles.ShopManager };

        /// <summary>
        /// Requirement #12 revision approvers: "Department Director / Manager /
        /// Shop Team Leader / Shop Manager".
        /// </summary>
        internal static readonly string[] RevisionApprovers =
            { OrgRoles.Director, OrgRoles.Manager, OrgRoles.ShopManager, OrgRoles.TeamLeader };
    }

    /// <summary>Small factory so every part file declares the drafting step identically.</summary>
    internal static class WorkflowStepFactory
    {
        internal static WorkflowStepDefinition Draft(
            string[] roles,
            string title = "Draft / prepare the form",
            bool ownShopOnly = false) => new()
            {
                StepNo = 0,
                Title = title,
                Status = ApprovalStatus.Draft,
                Kind = WorkflowStepKind.Draft,
                EligibleRoles = roles,
                Signature = SignatureBlockType.PreparedBy,
                RestrictToOriginatorShop = ownShopOnly,
                AllowsDelegation = false
            };
    }
}