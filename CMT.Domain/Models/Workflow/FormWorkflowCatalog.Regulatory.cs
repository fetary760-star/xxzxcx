using CMT.Domain.Models.Shared;
using static CMT.Domain.Models.Workflow.WorkflowRoleSets;
using static CMT.Domain.Models.Workflow.WorkflowStepFactory;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v16 - FormWorkflowCatalog.Regulatory.cs   (AMENDS THE v12 FILE)
    //
    // ============================ WHY v16 WAS NECESSARY ============================
    // v12 declared amendment item 2 correctly in INTENT: the four 918 / 918A approval
    // steps carry AllowsDelegatedReview = true plus a reviewer pool. But the steps left
    // WorkflowStepDefinition.AllowsDelegation at its DEFAULT, and that default is TRUE
    // (see WorkflowContracts.cs: `public bool AllowsDelegation { get; init; } = true;`).
    //
    // Consequences of that single omission, all of them fatal to the amendment:
    //
    //   (1) FormWorkflowCatalog.Validate() rule (c) of v15 reports FOUR problems:
    //         "MNT-918  step 1: a delegated-review step must set AllowsDelegation = false"
    //         "MNT-918  step 2: ... "
    //         "MNT-918A step 1: ... "
    //         "MNT-918A step 2: ... "
    //       i.e. the startup self-check / unit test fails and the catalog is rejected
    //       BEFORE any user ever sees the feature.
    //
    //   (2) Semantically the two capabilities became simultaneously available on the same
    //       step, which contradicts the requirement. With AllowsDelegation = true the
    //       GENERIC endpoint behind FormWorkflowCatalog.CanDelegateStep lets the Director
    //       hand the APPROVAL ITSELF to any less senior role. The printed "Approved by"
    //       block would then stamp THAT person - exactly the outcome the requirement
    //       forbids ("the form will route back to the Director, ECAA, or QA Manager for
    //       final approval, which will dynamically display the approver's name, date and
    //       signature").
    //
    //   (3) "Once the employee COMPLETES the review and confirms it" was unenforceable,
    //       because the steps never opted into DelegatedReviewRequiresComments, so an
    //       empty confirmation would have closed the excursion with no finding recorded.
    //
    // v16 therefore, and ONLY this:
    //   - sets AllowsDelegation = false on the four delegated-review steps (the approval
    //     stays with the approver; only a REVIEWER is borrowed);
    //   - sets DelegatedReviewRequiresComments = true on them explicitly, so the reviewer
    //     must record a finding before he may confirm;
    //   - documents the state machine next to each step.
    //
    // NOTHING ELSE CHANGED: same namespace, same partial class, same single method
    // RegulatoryForms(), same form-type constants, same printed form numbers, same step
    // numbers, same statuses, same signature blocks. Every other call site is unaffected.
    //
    // ================== WHY THIS FILE HAD TO BE REPLACED WHOLESALE (v12) ==================
    // The copy of FormWorkflowCatalog.Regulatory.cs originally in the solution was a
    // BYTE-FOR-BYTE DUPLICATE of FormWorkflowCatalog.Training.cs. It was evidently saved
    // over the wrong file name. Consequences, all of them fatal to the build:
    //
    // (1) CS0111 - duplicate member: it declared a SECOND
    //     'internal static FormWorkflowDefinition[] TrainingForms()' in the same
    //     partial class FormWorkflowCatalog.
    // (2) CS0102 - duplicate constants: it re-declared all eight training form numbers
    //     plus FieldTrainingRequired.
    // (3) CS0103 - 'RegulatoryForms' does not exist. FormWorkflowCatalog.cs opens the
    //     aggregation with RegulatoryForms().Concat(DocumentationForms())...
    // (4) CS0117 - the four form-type constants the rest of the solution reads FROM THIS
    //     FILE were absent (FolderSignOffFormType / AmendmentCycleFormType /
    //     RevisionCycleFormType / ATARecordFormType), consumed by
    //     FormWorkflowCatalog.Facility.cs and WorkflowStepTableReference.cs.
    //
    // ======================== AMENDMENT ITEM 2, VERBATIM ========================
    // "FAA Form 918 & CAA Form 918A: These forms are originally approved by the Director,
    //  ECAA, or QA Manager. Because the current form template lacks a dedicated 'Reviewer'
    //  section, the system must allow these managers to delegate a review assignment to a
    //  designated employee in their department. Once the employee completes the review and
    //  confirms it, the form will route back to the Director, ECAA, or QA Manager for final
    //  approval (which will dynamically display the approver's name, date, and signature)."
    //
    // Encoded DECLARATIVELY - the approver KEEPS the approval, only a reviewer is borrowed:
    //   - MNT-918  : Director step AND QA Manager step -> DelegatedReviewRoles = DeptEmployees
    //   - MNT-918A : Director step -> DeptEmployees, ECAA endorsement -> EcaaReviewPool
    //
    // The RETURN PATH is generic and lives in FormWorkflowCatalog.cs (v15+):
    //   step.Status --RequestDelegatedReview--> PendingDelegatedReview (31), SAME StepNo
    //               --ConfirmDelegatedReview--> step.Status,              SAME StepNo
    //               --Approve----------------->  NextStep(...)?.Status ?? Approved
    // Because the return status is DERIVED from the step, the approver resumes his OWN step
    // and therefore his OWN SignatureBlockType. The reviewer owns no SignatureBlockType at
    // all, which is the structural reason the printed "Approved by / Reviewed by /
    // Endorsed by" line can never be stamped with the reviewer's name.
    //
    // Amendment item 1 - automated forms - is NOT in this file. Rev. Status (MNT-1420) and
    // Task Card (MNT-1420C) live in FormWorkflowCatalog.Documentation.cs, which already
    // sets IsAutoGenerated = true and declares the drafting step only;
    // FormWorkflowCatalog.FirstStatusAfterSubmit() returns ApprovalStatus.Approved for them
    // and Validate() exempts them from the "no approval step" rule.
    //
    // HARD RULES (identical to every other part file of this layer)
    // - a METHOD, never a static field: static field initialisation order across
    //   partial-class files is undefined in C#;
    // - declarative only: no EF, no DbContext, no I/O, no JSON;
    // - every role comes from OrgRoles / WorkflowRoleSets, every status from
    //   ApprovalStatus: nothing is invented here;
    // - StepNo MUST start at 0 and be consecutive, because FormWorkflowCatalog.Validate()
    //   asserts exactly that;
    // - every FormNo literal below matches WorkflowStepTableReference.ExpectedForms
    //   character for character, otherwise Validate() fails.
    // =====================================================================================
    public static partial class FormWorkflowCatalog
    {
        // ---------------------------------------------------------------------------------
        // FORM TYPE CONSTANTS OWNED BY THIS PART FILE
        //
        // ATARecordFormType is the ATA record itself. The three folder-level types are
        // VIRTUAL forms: they have no FormSubmission row (which is why
        // FormWorkflowInstance.FormSubmissionId is nullable) and their step tables are
        // declared in FormWorkflowCatalog.Facility.cs.
        // ---------------------------------------------------------------------------------
        public const string ATARecordFormType = "ata_record";
        public const string FolderSignOffFormType = "evaluation_folder_signoff";
        public const string AmendmentCycleFormType = "expiry_amendment";
        public const string RevisionCycleFormType = "folder_revision";

        // ---------------------------------------------------------------------------------
        // PRINTED FORM NUMBERS
        // These literals are the ones WorkflowStepTableReference.ExpectedForms prints, so
        // they must not be "tidied up": "MNT-918 (Request Letter)" really does carry the
        // parenthetical, because the amendment request and the FAA 918 share the number
        // MNT-918 and the Table Of Contents has to disambiguate them.
        // ---------------------------------------------------------------------------------
        public const string FormNoPeriodicSelfAudit = "MNT-1325";
        public const string FormNoLetterOfConfirmation = "MNT-LOC";
        public const string FormNoRequestLetter = "MNT-918 (Request Letter)";
        public const string FormNo918FAA = "MNT-918";
        public const string FormNo918ACAA = "MNT-918A";
        public const string FormNoATARecord = "ATA-REC";

        // ---------------------------------------------------------------------------------
        // AMENDED v16 - STEP NUMBER CONSTANTS OF THE DELEGABLE 918 / 918A STEPS.
        // Exposed so no controller, engine branch or test ever hard-codes "step 1" / "step 2"
        // when it needs the delegated-review endpoints of the regulatory forms.
        // ---------------------------------------------------------------------------------

        /// <summary>MNT-918: Director approval, may borrow a departmental reviewer.</summary>
        public const int Form918StepDirectorApproval = 1;

        /// <summary>MNT-918: QA Manager final approval, may borrow a departmental reviewer.</summary>
        public const int Form918StepQaApproval = 2;

        /// <summary>MNT-918A: Director approval, may borrow a departmental reviewer.</summary>
        public const int Form918AStepDirectorApproval = 1;

        /// <summary>MNT-918A: ECAA Team endorsement, may borrow a reviewer of the ECAA pool.</summary>
        public const int Form918AStepEcaaEndorsement = 2;

        internal static FormWorkflowDefinition[] RegulatoryForms() => new[]
        {
            // -----------------------------------------------------------------------------
            // (1) PERIODIC CAPABILITY SELF-AUDIT - MNT-1325
            // "Before final release, the system presents Form MNT-1325 ... each required
            // page, tool equivalency and facility metric is verified step-by-step."
            // The Gate step is what makes that verification unskippable.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.PeriodicSelfAudit,
                FormNo = FormNoPeriodicSelfAudit,
                Title = "Periodic capability self-audit",
                Section = ToCSections.SelfAudit,
                Order = 1,
                DraftRoles = ShopLeadership,
                IncludeInFolder = true,
                IsMandatory = true,
                IsFinalReleaseGate = true,
                ExpiryMonths = 24,
                Remarks = "Gates the final release of the evaluation folder: the folder " +
                          "sign-off in FormWorkflowCatalog.Facility.cs cannot close while " +
                          "this form is still open.",
                Steps = new[]
                {
                    Draft(ShopLeadership, "STL / Shop Manager prepares the periodic capability self-audit", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Step-by-step MNT-1325 verification of every required page, tool equivalency and facility metric",
                        Status = ApprovalStatus.PendingSelfAuditCheck,
                        Kind = WorkflowStepKind.Gate,
                        EligibleRoles = SelfAuditActors,
                        // MNT-1325 slot fix: the hard copy prints ONLY two signature
                        // lines - "Self-audited By:" (Team Leader) and "Approved By:"
                        // (Manager). There is NO printed "Verified by" line, so the
                        // step-by-step gate is a STATE, not a signature line: its
                        // verification lives in the checklist counters, the frozen
                        // step row and the audit log - exactly like the delegated
                        // review of 918/918A (see the SignatureBlockType doc comment).
                        // The old VerifiedBy stamp froze a line that matched no slot.
                        Signature = SignatureBlockType.None,
                        RestrictToOriginatorShop = true,
                        IsStepByStepChecklist = true,
                        RequiresComments = true,
                        Skip = SkipMode.NotSkippable,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Manager reviews the completed self-audit",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        // MNT-1325 slot fix: the printed line is "Approved By:" with
                        // the role caption "Manager" (SELF_AUDIT_SLOTS in
                        // signature-matrix.ts). The old ReviewedBy stamp matched no
                        // printed slot, so the Manager's name / date / signature never
                        // appeared on the hard copy.
                        Signature = SignatureBlockType.ApprovedBy,
                        Skip = SkipMode.NotSkippable
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Department Director signs off the self-audit",
                        Status = ApprovalStatus.PendingDirectorApproval,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = Director,
                        // MNT-1325 slot fix: the hard copy has NO third printed line,
                        // and the Director must never overwrite the Manager's
                        // "Approved By:" data. SignedOffBy keeps the Director's frozen
                        // stamp (name / date / specimen / hash) in the approval
                        // history and the signature ledger, while the printed block
                        // stays exactly the two lines the paper carries.
                        Signature = SignatureBlockType.SignedOffBy,
                        Skip = SkipMode.NotSkippable
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (2) LETTER OF CONFIRMATION - MNT-LOC
            // Matrix: "Manager -> Director".
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ConfirmationLetter,
                FormNo = FormNoLetterOfConfirmation,
                Title = "Letter of confirmation",
                Section = ToCSections.LetterOfConfirmation,
                Order = 1,
                DraftRoles = ShopLeadership,
                IncludeInFolder = true,
                IsMandatory = true,
                Steps = new[]
                {
                    Draft(ShopLeadership, "Shop leadership drafts the letter of confirmation", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Manager approval",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Director signs the letter of confirmation",
                        Status = ApprovalStatus.PendingDirectorApproval,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (3) AMENDMENT REQUEST - MNT-918 (Request Letter)
            // Matrix: "Amendment Request 918: straight to Director."
            // BypassesLowerTiers documents that the Manager tier is deliberately absent.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.RequestLetter,
                FormNo = FormNoRequestLetter,
                Title = "Amendment request letter",
                Section = ToCSections.AmendmentRequest,
                Order = 1,
                DraftRoles = ShopLeadership,
                IncludeInFolder = true,
                IsMandatory = false,
                BypassesLowerTiers = true,
                Remarks = "Routed straight to the Director: no Manager tier by design.",
                Steps = new[]
                {
                    Draft(ShopLeadership, "Requester drafts the amendment request", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Director approves the amendment request",
                        Status = ApprovalStatus.PendingDirectorApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (4) FAA FORM 918 - MNT-918 *** AMENDMENT ITEM 2 ***
            //
            // Originally approved by the Director and the QA Manager. Both tiers may now
            // BORROW a departmental reviewer instead of losing the approval:
            //
            //   Director step -> AllowsDelegatedReview = true, DelegatedReviewRoles = DeptEmployees
            //   QA step       -> AllowsDelegatedReview = true, DelegatedReviewRoles = DeptEmployees
            //
            // AMENDED v16 - both steps now ALSO declare, explicitly:
            //   AllowsDelegation = false               -> the APPROVAL is never handed over,
            //                                             only a reviewer is borrowed. Without
            //                                             this line the generic delegate
            //                                             endpoint could transfer the approval
            //                                             and the signature block would stamp
            //                                             the delegate instead of the approver.
            //   DelegatedReviewRequiresComments = true -> "once the employee COMPLETES the
            //                                             review and confirms it": an empty
            //                                             confirmation is rejected by
            //                                             FormWorkflowCatalog
            //                                             .IsDelegatedReviewConfirmationValid.
            //
            // Runtime behaviour, entirely generic (no per-form code anywhere):
            //   PendingDirectorApproval --(Director requests review)--> PendingDelegatedReview (31)
            //                           --(reviewer confirms)--------> PendingDirectorApproval
            //                           --(Director approves)--------> PendingQAApproval ...
            //
            // The signature block still stamps the DIRECTOR / QA MANAGER, because the
            // reviewer's excursion never carries a SignatureBlockType: only these steps do
            // (ReviewedBy / ApprovedBy). That is the "dynamically display the approver's
            // name, date and signature" requirement, satisfied structurally.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.Form918FAA,
                FormNo = FormNo918FAA,
                Title = "FAA Form 918 - capability list amendment",
                Section = ToCSections.Form918FAA,
                Order = 1,
                DraftRoles = ShopLeadership,
                IncludeInFolder = true,
                IsMandatory = true,
                JointApprovalCompanionFormType = FormNodeTypes.Form918ACAA,
                Remarks = "AMENDED v16: the form template has no printed Reviewer section, so " +
                          "the delegated review is a STATE (PendingDelegatedReview), not a " +
                          "signature line. The approver keeps the approval " +
                          "(AllowsDelegation = false) and the reviewer must record a finding " +
                          "before he may confirm.",
                Steps = new[]
                {
                    Draft(ShopLeadership, "Shop leadership prepares the FAA 918 submission", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = Form918StepDirectorApproval,
                        Title = "Director approval (may first delegate a departmental review)",
                        Status = ApprovalStatus.PendingDirectorApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ReviewedBy,
                        Skip = SkipMode.NotSkippable,
                        // ---- AMENDED v16: the approval is NOT transferable ----
                        AllowsDelegation = false,
                        // ---- AMENDED v12 / v16: only a REVIEWER is borrowed ----
                        AllowsDelegatedReview = true,
                        DelegatedReviewRoles = DeptEmployees,
                        DelegatedReviewRequiresComments = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = Form918StepQaApproval,
                        Title = "QA Manager final approval (may first delegate a departmental review)",
                        Status = ApprovalStatus.PendingQAApproval,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = Qa,
                        Signature = SignatureBlockType.ApprovedBy,
                        Skip = SkipMode.NotSkippable,
                        // ---- AMENDED v16 ----
                        AllowsDelegation = false,
                        // ---- AMENDED v12 / v16 ----
                        AllowsDelegatedReview = true,
                        DelegatedReviewRoles = DeptEmployees,
                        DelegatedReviewRequiresComments = true
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (5) CAA FORM 918A - MNT-918A *** AMENDMENT ITEM 2 ***
            // Joint path with MNT-918; closes at the ECAA endorsement.
            // Director step delegable to DeptEmployees, ECAA step delegable to EcaaReviewPool.
            // AMENDED v16: both steps set AllowsDelegation = false and require a review
            // finding, for the same reasons documented on MNT-918 above.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.Form918ACAA,
                FormNo = FormNo918ACAA,
                Title = "CAA Form 918A - capability list amendment",
                Section = ToCSections.Form918ACAA,
                Order = 1,
                DraftRoles = ShopLeadership,
                IncludeInFolder = true,
                IsMandatory = true,
                JointApprovalCompanionFormType = FormNodeTypes.Form918FAA,
                IsGeneratedByJointApproval = true,
                Remarks = "AMENDED v16: ECAA and the Director may each borrow a reviewer; the " +
                          "endorsement and the approval stay with them (AllowsDelegation = false).",
                Steps = new[]
                {
                    Draft(ShopLeadership, "Shop leadership prepares the CAA 918A submission", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = Form918AStepDirectorApproval,
                        Title = "Director approval (may first delegate a departmental review)",
                        Status = ApprovalStatus.PendingDirectorApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ReviewedBy,
                        Skip = SkipMode.NotSkippable,
                        // ---- AMENDED v16 ----
                        AllowsDelegation = false,
                        // ---- AMENDED v12 / v16 ----
                        AllowsDelegatedReview = true,
                        DelegatedReviewRoles = DeptEmployees,
                        DelegatedReviewRequiresComments = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = Form918AStepEcaaEndorsement,
                        Title = "ECAA Team endorsement (may first delegate a review)",
                        Status = ApprovalStatus.PendingECAAEndorsement,
                        Kind = WorkflowStepKind.Endorsement,
                        EligibleRoles = Ecaa,
                        Signature = SignatureBlockType.EndorsedBy,
                        Skip = SkipMode.NotSkippable,
                        // ---- AMENDED v16 ----
                        AllowsDelegation = false,
                        // ---- AMENDED v12 / v16 ----
                        AllowsDelegatedReview = true,
                        DelegatedReviewRoles = EcaaReviewPool,
                        DelegatedReviewRequiresComments = true
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (6) ATA RECORD - ATA-REC
            // Listed by WorkflowStepTableReference under the DOCUMENTATION section, but
            // owned here because it is the regulatory anchor of the whole folder.
            // "Drafted by the STL, optionally assigned to a designated Certifying Staff
            // member for action."
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = ATARecordFormType,
                FormNo = FormNoATARecord,
                Title = "ATA record",
                Section = ToCSections.Documentation,
                Order = 1,
                DraftRoles = StlEngShopMgr,
                IncludeInFolder = true,
                IsMandatory = true,
                Steps = new[]
                {
                    Draft(StlEngShopMgr, "STL / Engineer / Shop Manager prepares the ATA record", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "STL designates the Certifying Staff member who will action the record",
                        Status = ApprovalStatus.PendingAssignment,
                        Kind = WorkflowStepKind.Assignment,
                        EligibleRoles = StlAssigners,
                        AssignerRoles = StlAssigners,
                        RequiresManualAssignment = true,
                        RestrictToOriginatorShop = true,
                        Skip = SkipMode.NotSkippable
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Certifying Staff completes the ATA record entries",
                        Status = ApprovalStatus.PendingCertifyingStaffAction,
                        Kind = WorkflowStepKind.Processing,
                        EligibleRoles = CertifyingStaff,
                        Signature = SignatureBlockType.ProcessedBy,
                        RestrictToOriginatorShop = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Shop Team Leader reviews the ATA record",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = ShopLeadership,
                        Signature = SignatureBlockType.ReviewedBy,
                        RestrictToOriginatorShop = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 4,
                        Title = "Manager approves the ATA record",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            }
        };
    }
}