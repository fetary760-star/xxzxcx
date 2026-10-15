using CMT.Domain.Models.Shared;
using static CMT.Domain.Models.Workflow.WorkflowRoleSets;
using static CMT.Domain.Models.Workflow.WorkflowStepFactory;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v9 - FormWorkflowCatalog.Tools.cs   (NEW FILE - THIS FILE FIXES CS0103)
    //
    // BUILD ERROR THIS FILE RESOLVES
    //   FormWorkflowCatalog.cs(48,25): error CS0103: The name 'ToolsForms' does not exist
    //
    // Part 4 of the per-form step tables. Requirement #6 of the Functional Workflow Matrix,
    // the TOOLS AND EQUIPMENT section of the Table Of Contents (7 forms):
    //
    //   (1) tna                          MNT-1229B   - the Tool Need Analysis itself
    //   (2) tool_need_analysis_report    MNT-1229B-R - the consolidated TNA report
    //   (3) alternate_tools_equivalency  MNT-1229C   - alternate tool pathway (ENG -> Special TL)
    //   (4) inhouse_manufactured_tools   MNT-1229D   - in-house manufactured tools card
    //   (5) tool_mfg_jic                 MNT-1229E   - in-house manufacturing job instruction card
    //   (6) tool_risk_assessment         MNT-1229F   - in-house manufacturing risk assessment
    //   (7) tool_mfg_form_1554           MNT-1554    - manufacturing release form
    //
    // MATRIX RULES ENCODED HERE
    //   "Drafted directly by the STL or assigned to an Engineer (ENG)."
    //       -> step 1 of MNT-1229B is an OPTIONAL manual assignment: when
    //          FormDataJson.assignToEngineer is false / absent, step 1 and the Engineer
    //          processing step 2 are auto-skipped and the STL keeps the pen.
    //   "Standard Approval Sequence: Manager (MGR) to Special Team Leader."
    //       -> PendingManagerApproval -> PendingSpecialTeamLeaderApproval, in that order,
    //          on BOTH MNT-1229B and the TNA report.
    //   "Alternate tool draft pathways by Engineer with routing to Special Team Leader
    //    and approval."
    //       -> alternate_tools_equivalency is drafted by the ENG and has exactly ONE
    //          approval tier: the Special Team Leader.
    //   "Conditional in-house steps can be dynamically skipped by the user or
    //    auto-allocated based on form fields."
    //       -> every in-house step uses SkipMode.ManualOrAuto with the shared field
    //          "inhouseManufacturingRequired", so the user may press Skip (subject to
    //          RoleHierarchy.CanSkipSteps) OR the engine auto-skips from the payload.
    //   Tool calibration expiry (requirement #10) is seeded from ExpiryMonths = 12 on the
    //   TNA report and the equivalency matrix.
    // =====================================================================================

    public static partial class FormWorkflowCatalog
    {
        // ---------------------------------------------------------------------------------
        // PRINTED FORM NUMBERS  (MNT-1229B and MNT-1554 are the numbers given in the matrix)
        // ---------------------------------------------------------------------------------
        public const string FormNoTNA = "MNT-1229B";
        public const string FormNoTNAReport = "MNT-1229B-R";
        public const string FormNoAlternateTools = "ENG 751";
        public const string FormNoInhouseTools = "MNT-1229D";
        public const string FormNoToolMfgJic = "MNT-1229E (JIC)";
        public const string FormNoToolRiskAssessment = "MNT-1229F";
        public const string FormNoToolMfg1554 = "MNT-1554";

        /// <summary>FormDataJson key: "true" when the STL hands the TNA over to an Engineer.</summary>
        public const string FieldAssignToEngineer = "assignToEngineer";

        /// <summary>FormDataJson key driving every conditional in-house manufacturing step.</summary>
        public const string FieldInhouseManufacturingRequired = "inhouseManufacturingRequired";

        /// <summary>FormDataJson key: "true" when an alternate (non-OEM) tool is proposed.</summary>
        public const string FieldAlternateToolUsed = "alternateToolUsed";

        internal static FormWorkflowDefinition[] ToolsForms() => new[]
        {
            // -----------------------------------------------------------------------------
            // (1) TOOL NEED ANALYSIS - MNT-1229B
            //     Draft: STL or ENG.
            //     Optional hand-over to an Engineer (skip logic).
            //     Standard approval sequence: MGR -> Special Team Leader.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.TNA,
                FormNo = FormNoTNA,
                Title = "Tool and equipment need analysis (TNA)",
                Section = ToCSections.Tools,
                Order = 1,
                DraftRoles = StlOrEng,
                Remarks = "Drafted directly by the STL or assigned to an Engineer. Standard " +
                          "approval sequence: Manager (MGR) -> Special Team Leader.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Draft the tool need analysis (STL, or hand it to an Engineer)"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Optional: STL assigns the analysis to an Engineer",
                        Status = ApprovalStatus.PendingAssignment,
                        Kind = WorkflowStepKind.Assignment,
                        EligibleRoles = StlAssigners,
                        AssignerRoles = StlAssigners,
                        RequiresManualAssignment = true,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.None,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldAssignToEngineer,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Drafted directly by the STL: no Engineer assignment needed."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Engineer completes the technical tool need analysis",
                        Status = ApprovalStatus.PendingEngineerAction,
                        Kind = WorkflowStepKind.Processing,
                        EligibleRoles = Engineer,
                        Signature = SignatureBlockType.ProcessedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldAssignToEngineer,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "Drafted directly by the STL: Engineer step not applicable."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Shop Team Leader confirms the prepared TNA",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = StlAssigners,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.None,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 4,
                        Title = "Manager (MGR) approval - standard sequence step 1",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        // MNT-1229B: the printed TNA hard copy signs the Manager on the
                        // "Approved by:" line (TNA_SLOTS block ApprovedBy, role "Mgr.
                        // Componenet Shop"). The old ReviewedBy freeze stamped a block the
                        // printed matrix never reads, so the historical Manager approval
                        // vanished for every viewer.
                        Signature = SignatureBlockType.ApprovedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 5,
                        Title = "Special Team Leader approval - standard sequence step 2",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (2) TOOL NEED ANALYSIS REPORT - MNT-1229B-R
            //     Consolidated report. Same standard sequence, carries the calibration expiry.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ToolNeedAnalysisReport,
                FormNo = FormNoTNAReport,
                Title = "Tool need analysis report",
                Section = ToCSections.Tools,
                Order = 2,
                DraftRoles = StlOrEng,
                ExpiryMonths = 12,
                Remarks = "Consolidated TNA report. Standard approval sequence MGR -> Special Team " +
                          "Leader. A 12-month validity seeds the tool calibration expiry tracking.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Consolidate the tool need analysis report"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer technical verification of the consolidated list",
                        Status = ApprovalStatus.PendingEngineerAction,
                        Kind = WorkflowStepKind.Verification,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.VerifiedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Manager (MGR) approval",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        // MNT-1229B-R: the report prints the same TNA_SLOTS matrix as the TNA
                        // itself - the Manager line is "Approved by:" (ApprovedBy), so the old
                        // ReviewedBy freeze erased the Manager approval from every viewer.
                        Signature = SignatureBlockType.ApprovedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Special Team Leader approval",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (3) ALTERNATE TOOLS EQUIVALENCY - MNT-1229C
            //     "Alternate tool draft pathways by Engineer with routing to Special Team
            //      Leader and approval."
            //     ONE approval tier only: the Special Team Leader. The Manager is NOT on
            //     this pathway by design.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.AlternateToolsEquivalency,
                FormNo = FormNoAlternateTools,
                Title = "Alternate tools equivalency",
                Section = ToCSections.Tools,
                Order = 3,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                ExpiryMonths = 12,
                Remarks = "Alternate tool pathway drafted by the Engineer and routed to the " +
                          "Special Team Leader for approval. Feeds the tool equivalency matrix " +
                          "monitored by requirement #12.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Engineer drafts the alternate tool equivalency justification"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer establishes the technical equivalency of the alternate tool",
                        Status = ApprovalStatus.PendingEngineerAction,
                        Kind = WorkflowStepKind.Processing,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        RequiresComments = true,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldAlternateToolUsed,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No alternate tool proposed: equivalency study not required."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Special Team Leader approval of the alternate tool pathway",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (4) IN-HOUSE MANUFACTURED TOOLS CARD - MNT-1229D
            //     Conditional in-house pathway: skippable manually or auto-allocated.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.InhouseManufacturedTools,
                FormNo = FormNoInhouseTools,
                Title = "In-house manufactured tools card",
                Section = ToCSections.Tools,
                Order = 4,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Conditional in-house pathway: the manufacturing step can be skipped " +
                          "manually by an authorised user or auto-skipped when " +
                          "FormDataJson.inhouseManufacturingRequired is false.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Register the in-house manufactured tool"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer in-house manufacturing definition (conditional / skippable)",
                        Status = ApprovalStatus.PendingInhouseProcess,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldInhouseManufacturingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No in-house manufacturing required for this tool."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Shop Team Leader review of the manufactured tool card",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Special Team Leader approval",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (5) IN-HOUSE MANUFACTURING TOOL JIC - MNT-1229E
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ToolMfgJic,
                FormNo = FormNoToolMfgJic,
                Title = "In-house manufacturing tool job instruction card (JIC)",
                Section = ToCSections.Tools,
                Order = 5,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Conditional in-house step. Auto-skipped together with the rest of the " +
                          "in-house pathway when no in-house manufacturing is required.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Draft the manufacturing job instruction card"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer writes the manufacturing instructions (conditional / skippable)",
                        Status = ApprovalStatus.PendingInhouseProcess,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldInhouseManufacturingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No in-house manufacturing required: JIC not applicable."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Shop Team Leader review of the JIC",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Special Team Leader approval of the JIC",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (6) IN-HOUSE MANUFACTURING RISK ASSESSMENT - MNT-1229F
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ToolRiskAssessment,
                FormNo = FormNoToolRiskAssessment,
                Title = "In-house manufacturing tool risk assessment",
                Section = ToCSections.Tools,
                Order = 6,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Conditional in-house step with a QA acceptance tier before the Special " +
                          "Team Leader approval.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Draft the tool manufacturing risk assessment"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer performs the risk assessment (conditional / skippable)",
                        Status = ApprovalStatus.PendingInhouseProcess,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        RequiresComments = true,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldInhouseManufacturingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No in-house manufacturing required: risk assessment not applicable."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "QA Personnel acceptance of the risk assessment",
                        Status = ApprovalStatus.PendingQAApproval,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = Qa,
                        Signature = SignatureBlockType.VerifiedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Special Team Leader approval",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (7) TOOL MANUFACTURING RELEASE - MNT-1554
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ToolMfgForm1554,
                FormNo = FormNoToolMfg1554,
                Title = "In-house manufactured tool release (Form 1554)",
                Section = ToCSections.Tools,
                Order = 7,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Release of the manufactured tool. Auto-skipped when no in-house " +
                          "manufacturing is required; otherwise MGR -> Special Team Leader.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Prepare the tool manufacturing release form"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer completes Form 1554 (conditional / skippable)",
                        Status = ApprovalStatus.PendingEngineerAction,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldInhouseManufacturingRequired,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No in-house manufacturing required: Form 1554 not applicable."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Manager (MGR) approval",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOnly,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Special Team Leader release approval",
                        Status = ApprovalStatus.PendingSpecialTeamLeaderApproval,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = SpecialTl,
                        Signature = SignatureBlockType.IssuedBy,
                        AllowsDelegation = false
                    }
                }
            }
        };
    }
}