using CMT.Domain.Models.Shared;
using static CMT.Domain.Models.Workflow.WorkflowRoleSets;
using static CMT.Domain.Models.Workflow.WorkflowStepFactory;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v16 - FormWorkflowCatalog.Training.cs   (AMENDS THE v9 / v12 FILE)
    //
    // ============================ WHAT v16 CHANGES ============================
    // Training Verification routing:
    //   Shop Team Leader -> Special Admin -> Respective Manager -> HR Specialist.
    //
    // The two Training Verification forms share this chain; the catalog below is the
    // executable source of truth for both variants.
    //
    //  (1) NEITHER step declared DelegatedReviewRequiresComments. It defaults to true in
    //      WorkflowContracts.cs, so the behaviour was already correct - but it was implicit,
    //      and an implicit rule on a regulated approval chain is a latent regression: any
    //      future edit of the contract default would silently allow an EMPTY review
    //      confirmation, i.e. "the employee confirms" without ever "completing the review".
    //      v16 states it explicitly on every delegated-review step of this file.
    //
    //  (2) The COMPONENT MAINTENANCE TRAINING enrolment (MNT-TRN-01) has the very same
    //      HR Manager approval tier ("HR Manager approval of the verified training
    //      package"), and the requirement scopes the capability to the approver ROLE - the
    //      HR Manager - not to one single form number. Its step 2 was the only HR Manager
    //      APPROVAL step in the section that could not borrow an HR Specialist reviewer,
    //      which made the feature behave inconsistently for the same manager on two
    //      adjacent rows of the same Table Of Contents section. v16 enables it there too.
    //
    //  (3) Step numbers of the delegable steps were not exposed, so a controller or a test
    //      had to hard-code "step 2". v16 publishes them as constants.
    //
    // DELIBERATELY NOT CHANGED
    //   - The CONDITIONAL HR Manager steps of MNT-TRN-04 / 05 / 06 (similar technology,
    //     similar task, simple task) stay non-delegable. Those steps exist only to be
    //     SKIPPED when trainingRequired = false ("bypass full evaluation and route directly
    //     to Team Leader for quick review"). Parking a step that is designed to disappear
    //     inside a review excursion would let a skippable step block the chain.
    //   - AllowsDelegation stays FALSE on every HR Manager step: the HR Manager may NOT
    //     hand the APPROVAL to anybody. Borrowing a reviewer and giving the approval away
    //     are mutually exclusive, and FormWorkflowCatalog.Validate() rule (c) enforces it.
    //   - MNT-1378 (Inspector) and MNT-922C (Technician) stay exclusive to their role:
    //     the requirement names no delegated review for them.
    //
    // ============================ WHAT v9 ALREADY DID ============================
    // FormWorkflowCatalog.cs(47,25): error CS0103: The name 'TrainingForms' does not exist.
    // The aggregator calls RegulatoryForms().Concat(DocumentationForms())
    //   .Concat(TrainingForms())   <-- declared HERE
    //   .Concat(ToolsForms()).Concat(FacilityForms())
    //
    // Part 3 of the per-form step tables. Requirement #7 of the Functional Workflow Matrix,
    // the TRAINING DOCUMENT section of the Table Of Contents (8 forms):
    //
    // (1) component_maintenance_training      - STL -> HR Spec -> HR Mgr -> STL
    // (2) training_verification_inspection    - STL -> Inspector -> STL -> HR -> Manager
    // (3) training_verification_technician    - STL -> Technician -> STL -> HR -> Manager
    // (4) inspector_proficiency MNT-1378      - EXCLUSIVELY the designated Inspector
    // (5) competency_assessment MNT-922C      - directly to the Technician for sign-off
    // (6) similar_technology                  - skip logic when training is not required
    // (7) similar_task                        - skip logic, quick STL review
    // (8) simple_task                         - skip logic, quick STL review
    //
    // MATRIX RULES ENCODED HERE
    //   "Shop Team Leader enrolls all employees belonging to his shop only."
    //     -> every draft / requester step sets RestrictToOriginatorShop = true.
    //   "Employee -> STL verification -> HR certification -> Manager approval."
    //     -> PendingInspectorReview / PendingTechnicianSignOff ->
    //        PendingTeamLeaderReview -> PendingHRVerification -> PendingManagerApproval.
    //   "Inspection Proficiency (MNT-1378): routed exclusively to the designated Inspector
    //    role for sequential review and final approval."
    //     -> TWO Inspector steps, AllowsDelegation = false, no other role on the chain.
    //   "Competency Assessment (MNT 3.14-020 / MNT-922C): routed directly to the Technician
    //    for review and task completion sign-off."
    //     -> PendingTechnicianSignOff carries SignatureBlockType.SignedOffBy.
    //   "Simple / Similar Tasks (Skip Logic): if training is not required, bypass full
    //    evaluation and route directly to Team Leader for quick review."
    //     -> the HR steps use SkipMode.ManualOrAuto with SkipConditionField
    //        "trainingRequired" and SkipWhenValue "false"; the Team Leader quick-review step
    //        is NotSkippable so the form can never close unreviewed.
    //
    // HARD RULES (identical to the other part files)
    //   - a METHOD, never a static field: static field initialisation order across
    //     partial-class files is undefined in C#;
    //   - declarative only: no EF, no DbContext, no I/O, no JSON;
    //   - every role comes from OrgRoles, every status from ApprovalStatus: nothing invented.
    // =====================================================================================
    public static partial class FormWorkflowCatalog
    {
        // ---------------------------------------------------------------------------------
        // PRINTED FORM NUMBERS
        // MNT-1378, MNT-922C and MNT 3.14-020 are the numbers given in the matrix.
        // The remaining numbers are placeholders kept as constants ON PURPOSE: change the
        // literal here once and the whole solution (ToC, PDF report, API) follows.
        // ---------------------------------------------------------------------------------
        public const string FormNoComponentMaintenanceTraining = "MNT-TRN-01";
        public const string FormNoTrainingVerificationInspection = "MNT-TRN-02 (Inspection)";
        public const string FormNoTrainingVerificationTechnician = "MNT-TRN-03 (Technician)";
        public const string FormNoInspectorProficiency = "MNT-1378";
        public const string FormNoCompetencyAssessment = "MNT 3.14-020";
        public const string FormNoSimilarTechnology = "MNT-TRN-04";
        public const string FormNoSimilarTask = "MNT-TRN-05";
        public const string FormNoSimpleTask = "MNT-TRN-06";

        /// <summary>
        /// camelCase key inside FormDataJson that drives the training skip logic
        /// ("Simple / Similar Tasks: if training is not required, bypass full evaluation").
        /// </summary>
        public const string FieldTrainingRequired = "trainingRequired";

        // ---------------------------------------------------------------------------------
        // AMENDED v16 - STEP NUMBERS OF THE HR MANAGER STEPS THAT MAY BORROW AN HR
        // SPECIALIST REVIEWER. Published so no controller or test hard-codes a step number.
        // ---------------------------------------------------------------------------------

        /// <summary>MNT-TRN-01: HR Manager approval of the verified training package.</summary>
        public const int TrainingEnrolmentStepHrManagerApproval = 2;

        /// <summary>MNT-TRN-02 / MNT-TRN-03: HR Manager filters and forwards the eligible list.</summary>
        public const int TrainingVerificationStepHrManagerReview = 2;

        internal static FormWorkflowDefinition[] TrainingForms() => new[]
        {
            // -----------------------------------------------------------------------------
            // (1) COMPONENT MAINTENANCE TRAINING - enrolment of the shop employees
            // "Shop Team Leader enrolls all employees belonging to his shop only.
            //  To HR Specialist (Verification) -> HR Manager Approval ->
            //  Back to Requester STL Training Verification."
            //
            // AMENDED v16 - step 2 (HR Manager approval) may now borrow an HR Specialist as
            // the delegated REVIEWER, exactly like the two training-verification forms. The
            // approval itself stays with the HR Manager (AllowsDelegation = false), so
            // SignatureBlockType.ApprovedBy keeps stamping the HR MANAGER's name, date and
            // signature.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ComponentMaintenanceTraining,
                FormNo = FormNoComponentMaintenanceTraining,
                Title = "Component maintenance training enrolment",
                Section = ToCSections.Training,
                Order = 1,
                DraftRoles = StlOnly,
                ExpiryMonths = 24,
                Remarks = "STL enrols employees of HIS OWN SHOP ONLY. HR Specialist verifies, " +
                          "HR Manager approves, then the package returns to the requesting STL " +
                          "for training verification. AMENDED v16: the HR Manager may first " +
                          "delegate the initial review to an HR Specialist and still signs the " +
                          "approval himself.",
                Steps = new[]
                {
                    Draft(ShopLeadership, "STL enrols the employees of his own shop", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "HR Specialist verifies the enrolment and updates the training status",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.Verification,
                        EligibleRoles = HrSpecialist,
                        AssignerRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.VerifiedBy,
                        AllowsDelegation = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = TrainingEnrolmentStepHrManagerApproval,
                        Title = "HR Manager approval of the verified training package (may first delegate the initial review)",
                        Status = ApprovalStatus.PendingHRManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.ApprovedBy,
                        // The APPROVAL is never handed over - see the file header.
                        AllowsDelegation = false,
                        // ---- AMENDED v16 - amendment item 3 ----
                        AllowsDelegatedReview = true,
                        DelegatedReviewRoles = HrSpecialistOnly,
                        DelegatedReviewRequiresComments = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Back to the requester: STL training verification and closure",
                        Status = ApprovalStatus.PendingRequesterVerification,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.SignedOffBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (2) TRAINING VERIFICATION - INSPECTION
            // "STL saves the evaluation. Special Admin assigns the respective Manager;
            //  the Manager approves and assigns HR Specialist for final approval."
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.TrainingVerificationInspection,
                FormNo = FormNoTrainingVerificationInspection,
                Title = "Training verification - Inspection personnel",
                Section = ToCSections.Training,
                Order = 2,
                DraftRoles = StlOnly,
                ExpiryMonths = 24,
                Remarks = "The Shop Team Leader saves the evaluation into the Special Admin " +
                          "review queue. The respective Manager approves and assigns it to " +
                          "an HR Specialist for final approval.",
                Steps = new[]
                {
                    Draft(StlOnly, "STL completes the inspection training verification", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Special Admin reviews and assigns the respective Manager",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Assignment,
                        EligibleRoles = new[] { OrgRoles.SpecialAdmin },
                        AssignerRoles = new[] { OrgRoles.SpecialAdmin },
                        RequiresManualAssignment = true,
                        Signature = SignatureBlockType.None,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = TrainingVerificationStepHrManagerReview,
                        Title = "Respective Manager reviews and assigns the HR Specialist",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "HR Specialist grants final approval",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = HrSpecialistOnly,
                        AssignerRoles = new[] { OrgRoles.Manager },
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        RequiresManualAssignment = true,
                        Signature = SignatureBlockType.VerifiedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (3) TRAINING VERIFICATION - TECHNICIAN (same chain, technician population)
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.TrainingVerificationTechnician,
                FormNo = FormNoTrainingVerificationTechnician,
                Title = "Training verification - Technician personnel",
                Section = ToCSections.Training,
                Order = 3,
                DraftRoles = StlOnly,
                ExpiryMonths = 24,
                Remarks = "The Shop Team Leader saves the evaluation into the Special Admin " +
                          "review queue. The respective Manager approves and assigns it to " +
                          "an HR Specialist for final approval.",
                Steps = new[]
                {
                    Draft(StlOnly, "STL completes the technician training verification", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Special Admin reviews and assigns the respective Manager",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Assignment,
                        EligibleRoles = new[] { OrgRoles.SpecialAdmin },
                        AssignerRoles = new[] { OrgRoles.SpecialAdmin },
                        RequiresManualAssignment = true,
                        Signature = SignatureBlockType.None,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = TrainingVerificationStepHrManagerReview,
                        Title = "Respective Manager reviews and assigns the HR Specialist",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "HR Specialist grants final approval",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = HrSpecialistOnly,
                        AssignerRoles = new[] { OrgRoles.Manager },
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        RequiresManualAssignment = true,
                        Signature = SignatureBlockType.VerifiedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (4) INSPECTION PROFICIENCY - MNT-1378
            // "Routed EXCLUSIVELY to the designated Inspector role for sequential review
            //  and final approval."
            // => after the assignment step, ONLY OrgRoles.Inspector appears on the chain and
            //    delegation is disabled, otherwise "exclusively" would not hold.
            //    No delegated review either: the requirement names none for this form.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.InspectorProficiency,
                FormNo = FormNoInspectorProficiency,
                Title = "Inspection proficiency evaluation",
                Section = ToCSections.Training,
                Order = 4,
                DraftRoles = StlOnly,
                ExpiryMonths = 24,
                Remarks = "Routed exclusively to the designated Inspector: sequential review " +
                          "(step 2) then final approval (step 3). No other role may act and the " +
                          "steps can never be delegated.",
                Steps = new[]
                {
                    Draft(StlOnly, "Prepare the MNT-1378 proficiency evaluation", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "STL designates the Inspector who will own the evaluation",
                        Status = ApprovalStatus.PendingAssignment,
                        Kind = WorkflowStepKind.Assignment,
                        EligibleRoles = InspectorOnly,
                        AssignerRoles = StlOnly,
                        RequiresManualAssignment = true,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.None
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Designated Inspector sequential review of the proficiency items",
                        Status = ApprovalStatus.PendingInspectorReview,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = InspectorOnly,
                        Signature = SignatureBlockType.ReviewedBy,
                        RequiresComments = true,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Shop Team Leader final review and approval of MNT-1378",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (5) COMPETENCY ASSESSMENT - MNT 3.14-020 / MNT-922C
            // "Routed directly to the Technician for review and task completion sign-off."
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.CompetencyAssessment,
                FormNo = FormNoCompetencyAssessment,
                Title = "Competency assessment (Technician)",
                Section = ToCSections.Training,
                Order = 5,
                DraftRoles = StlOnly,
                ExpiryMonths = 24,
                Remarks = "The Shop Team Leader saves the assessment into the Special Admin " +
                          "review queue. HR Specialist processing follows, then the Manager " +
                          "performs final approval.",
                Steps = new[]
                {
                    Draft(StlOnly, "Complete the competency assessment", ownShopOnly: true),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Special Admin reviews and approves the competency assessment",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = new[] { OrgRoles.SpecialAdmin },
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "HR Specialist processes and assigns the competency assessment",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.Verification,
                        EligibleRoles = HrSpecialistOnly,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.VerifiedBy,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Respective Manager performs final approval",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (6) SIMILAR TECHNOLOGY EVALUATION - skip logic
            // "If training is not required, bypass full evaluation and route directly to
            //  Team Leader for quick review."
            // NOTE (v16): these conditional HR steps stay NON-delegable on purpose - a step
            // designed to be skipped must never be able to park inside a review excursion.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.SimilarTechnology,
                FormNo = FormNoSimilarTechnology,
                Title = "Similar technology evaluation",
                Section = ToCSections.Training,
                Order = 6,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "When FormDataJson.trainingRequired is false the HR evaluation steps " +
                          "are skipped automatically and the form goes straight to the Team " +
                          "Leader for a quick review.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Describe the similar technology and the training need"),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "HR Specialist full training evaluation (skipped when training is not required)",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = HrSpecialist,
                        AssignerRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.VerifiedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldTrainingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Training not required: full evaluation bypassed."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "HR Manager approval (skipped when training is not required)",
                        Status = ApprovalStatus.PendingHRManagerApproval,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.ReviewedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldTrainingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Training not required: HR approval bypassed."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Team Leader quick review and approval",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (7) SIMILAR TASK - skip logic, quick Team Leader review
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.SimilarTask,
                FormNo = FormNoSimilarTask,
                Title = "Similar task declaration",
                Section = ToCSections.Training,
                Order = 7,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Simple / similar task: the HR verification step is bypassed when no " +
                          "training is required; the Team Leader quick review always executes.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Declare the similar task and its training impact"),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "HR Specialist verification (skipped when training is not required)",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = HrSpecialist,
                        AssignerRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.VerifiedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldTrainingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Training not required: HR verification bypassed."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Team Leader quick review and approval",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (8) SIMPLE TASK - skip logic, quick Team Leader review
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.SimpleTask,
                FormNo = FormNoSimpleTask,
                Title = "Simple task declaration",
                Section = ToCSections.Training,
                Order = 8,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Identical skip logic to the similar-task form: no training means no HR " +
                          "evaluation, only the Team Leader quick review.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Declare the simple task and its training impact"),
                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "HR Specialist verification (skipped when training is not required)",
                        Status = ApprovalStatus.PendingHRVerification,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = HrSpecialist,
                        AssignerRoles = HrManager,
                        AssignmentUnit = FunctionalUnits.HumanResources,
                        Signature = SignatureBlockType.VerifiedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldTrainingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Training not required: HR verification bypassed."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Team Leader quick review and approval",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            }
        };
    }
}