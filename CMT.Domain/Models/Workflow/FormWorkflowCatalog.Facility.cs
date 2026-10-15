using System;
using CMT.Domain.Models.Shared;
using static CMT.Domain.Models.Workflow.WorkflowRoleSets;
using static CMT.Domain.Models.Workflow.WorkflowStepFactory;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v9 - FormWorkflowCatalog.Facility.cs   (NEW FILE - THIS FILE FIXES CS0103)
    //
    // BUILD ERROR THIS FILE RESOLVES
    //   FormWorkflowCatalog.cs(49,25): error CS0103: The name 'FacilityForms' does not exist
    //
    // Part 5 (last part) of the per-form step tables. It covers three ToC sections plus the
    // three FOLDER-LEVEL virtual forms whose constants were already declared in
    // FormWorkflowCatalog.Regulatory.cs (FolderSignOffFormType / AmendmentCycleFormType /
    // RevisionCycleFormType) but had NO step table yet - without them the engine would fall
    // back to the generic v7 chain for the folder itself.
    //
    //   FACILITY REQUIREMENT EVALUATION (3 forms)
    //     (1) repair_facility_evaluation
    //     (2) cleaning_facility_evaluation
    //     (3) environmental_facility_evaluation
    //
    //   CONSUMABLES (2 forms)
    //     (4) list_of_consumables
    //     (5) alternate_consumable_declaration        (conditional / skippable)
    //
    //   FOLDER LEVEL (virtual forms - requirements #10, #11, #12, #13)
    //     (6) evaluation_folder_signoff  - MNT-1325 gate -> STL -> MGR -> DIR final sign-off
    //     (7) expiry_amendment           - expiry notification -> amend -> approval cycle
    //     (8) folder_revision            - two-year / CMM-triggered revision cycle
    //
    // MATRIX RULES ENCODED HERE
    //   "Before final release, the system presents Form MNT-1325 ... each required page,
    //    tool equivalency and facility metric is verified step-by-step."
    //       -> the folder sign-off STARTS with a Gate step (PendingSelfAuditCheck,
    //          IsStepByStepChecklist = true, RequiresComments = true), so a folder can never
    //          be released without walking the checklist.
    //   "Sequentially signed off by the role hierarchy and approved until completion."
    //       -> STL/Shop Manager -> MGR -> DIR, the last step being PendingFinalSignOff.
    //   "Once notified, a role-based editing process allows designated personnel to amend the
    //    task data, followed by a specific approval cycle before finalizing changes."
    //       -> expiry_amendment: PendingAmendmentApproval then PendingManagerApproval.
    //   "Standard two-year revision cycle ... coordinated approval workflow involving the
    //    Department Director, Manager, Shop Team Leader or Shop Manager."
    //       -> folder_revision closes at the Director; ExpiryMonths = 24 seeds the two-year
    //          trigger and RevisionApprovers is the coordinated approval set.
    // =====================================================================================

    public static partial class FormWorkflowCatalog
    {
        // ---------------------------------------------------------------------------------
        // PRINTED FORM NUMBERS (placeholders kept as constants: change once, applies everywhere)
        // ---------------------------------------------------------------------------------
        public const string FormNoRepairFacility = "MNT-FAC-01 (Repair)";
        public const string FormNoCleaningFacility = "MNT-FAC-02 (Cleaning)";
        public const string FormNoEnvironmentalFacility = "MNT-FAC-03 (Environmental)";
        public const string FormNoConsumablesList = "MNT-CON-01";
        public const string FormNoAlternateConsumable = "MNT-CON-02";
        public const string FormNoFolderSignOff = "SE-SIGNOFF";
        public const string FormNoAmendmentCycle = "SE-AMEND";
        public const string FormNoRevisionCycle = "SE-REV";

        /// <summary>FormDataJson key: "true" when an alternate consumable is declared.</summary>
        public const string FieldAlternateConsumableUsed = "alternateConsumableUsed";

        /// <summary>Roles allowed to OWN (edit) an expiry amendment - requirement #10.</summary>
        private static readonly string[] AmendmentOwners =
        {
            OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Engineer, OrgRoles.HRManager
        };

        /// <summary>Roles allowed to review an expiry amendment before it is finalised.</summary>
        private static readonly string[] AmendmentApprovers =
        {
            OrgRoles.TeamLeader, OrgRoles.ShopManager, OrgRoles.Manager,
            OrgRoles.HRManager, OrgRoles.SpecialTeamLeader
        };

        internal static FormWorkflowDefinition[] FacilityForms() => new[]
        {
            // -----------------------------------------------------------------------------
            // (1) REPAIR FACILITY EVALUATION
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.RepairFacilityEvaluation,
                FormNo = FormNoRepairFacility,
                Title = "Repair facility requirement evaluation",
                Section = ToCSections.Facility,
                Order = 1,
                DraftRoles = StlEngShopMgr,
                ExpiryMonths = 24,
                Remarks = "Facility metrics are re-verified step-by-step by the MNT-1325 gate " +
                          "before the folder is released.",
                Steps = FacilityChain("repair facility")
            },

            // -----------------------------------------------------------------------------
            // (2) CLEANING FACILITY EVALUATION
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.CleaningFacilityEvaluation,
                FormNo = FormNoCleaningFacility,
                Title = "Cleaning facility requirement evaluation",
                Section = ToCSections.Facility,
                Order = 2,
                DraftRoles = StlEngShopMgr,
                ExpiryMonths = 24,
                Remarks = "Same routing as the repair facility evaluation.",
                Steps = FacilityChain("cleaning facility")
            },

            // -----------------------------------------------------------------------------
            // (3) ENVIRONMENTAL FACILITY EVALUATION
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.EnvironmentalFacilityEvaluation,
                FormNo = FormNoEnvironmentalFacility,
                Title = "Environmental facility requirement evaluation",
                Section = ToCSections.Facility,
                Order = 3,
                DraftRoles = StlEngShopMgr,
                ExpiryMonths = 24,
                Remarks = "Same routing as the repair facility evaluation.",
                Steps = FacilityChain("environmental conditions")
            },

            // -----------------------------------------------------------------------------
            // (4) LIST OF CONSUMABLES
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.ConsumablesList,
                FormNo = FormNoConsumablesList,
                Title = "List of consumables",
                Section = ToCSections.Consumables,
                Order = 1,
                DraftRoles = StlOrEng,
                Remarks = "Certifying Staff verifies the list against the CMM, the STL approves " +
                          "and QA accepts.",
                Steps = new[]
                {
                    Draft(StlOrEng, "List the consumables required by the capability"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Certifying Staff verifies the consumables against the CMM",
                        Status = ApprovalStatus.PendingCertifyingStaffAction,
                        Kind = WorkflowStepKind.Verification,
                        EligibleRoles = CertifyingStaff,
                        AssignerRoles = StlAssigners,
                        RequiresManualAssignment = true,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.VerifiedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Shop Team Leader approval",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "QA Personnel acceptance",
                        Status = ApprovalStatus.PendingQAApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = Qa,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (5) ALTERNATE CONSUMABLE DECLARATION  (conditional / skippable)
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FormNodeTypes.AlternateConsumableDeclaration,
                FormNo = FormNoAlternateConsumable,
                Title = "Alternate consumable declaration",
                Section = ToCSections.Consumables,
                Order = 2,
                DraftRoles = StlOrEng,
                IsMandatory = false,
                Remarks = "Only required when an alternate consumable is proposed. The equivalency " +
                          "step is auto-skipped when FormDataJson.alternateConsumableUsed is false.",
                Steps = new[]
                {
                    Draft(StlOrEng, "Declare the alternate consumable and its equivalency"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Engineer establishes the consumable equivalency (conditional / skippable)",
                        Status = ApprovalStatus.PendingEngineerAction,
                        Kind = WorkflowStepKind.Conditional,
                        EligibleRoles = Engineer,
                        AssignerRoles = StlAssigners,
                        Signature = SignatureBlockType.ProcessedBy,
                        RequiresComments = true,
                        Skip = SkipMode.ManualOrAuto,
                        SkipConditionField = FieldAlternateConsumableUsed,
                        SkipWhenValue = "false",
                        SkipWhenFieldMissing = true,
                        SkipReasonTemplate = "No alternate consumable declared: equivalency not required."
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Shop Team Leader approval",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "QA Personnel acceptance of the alternate consumable",
                        Status = ApprovalStatus.PendingQAApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = Qa,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (6) FOLDER FINAL SIGN-OFF  (requirements #11 and #13)
            //     MNT-1325 step-by-step gate -> STL -> MGR -> DIR final sign-off + lock.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = FolderSignOffFormType,
                FormNo = FormNoFolderSignOff,
                Title = "Self-Evaluation folder final sign-off",
                Section = ToCSections.FinalSignOff,
                Order = 1,
                DraftRoles = StlEngShopMgr,
                Remarks = "Raised automatically when the last mandatory ToC form is approved. The " +
                          "MNT-1325 checklist is presented step-by-step before release, then the " +
                          "folder is signed off sequentially STL -> MGR -> DIR, marked Complete " +
                          "and Locked; the PDF report is generated on the final approval.",
                Steps = new[]
                {
                    Draft(StlEngShopMgr, "Prepare the folder for final release"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "MNT-1325 step-by-step check: pages, tool equivalency, facility metrics",
                        Status = ApprovalStatus.PendingSelfAuditCheck,
                        Kind = WorkflowStepKind.Gate,
                        EligibleRoles = SelfAuditActors,
                        Signature = SignatureBlockType.VerifiedBy,
                        IsStepByStepChecklist = true,
                        RequiresComments = true,
                        AllowsDelegation = false
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Shop Team Leader / Shop Manager sign-off",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.PreparedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Manager (MGR) sign-off",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = ManagerOrShopMgr,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 4,
                        Title = "Director (DIR) final sign-off - folder Completed and Locked",
                        Status = ApprovalStatus.PendingFinalSignOff,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (7) EXPIRY / AMENDMENT CYCLE  (requirement #10)
            //     Not a ToC row: raised by the expiry scanner for ONE expired item.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = AmendmentCycleFormType,
                FormNo = FormNoAmendmentCycle,
                Title = "Expiry amendment cycle",
                Section = ToCSections.AmendmentRequest,
                Order = 2,
                IncludeInFolder = false,
                IsMandatory = false,
                DraftRoles = AmendmentOwners,
                Remarks = "Raised automatically when a tracked item expires (training verification, " +
                          "tool calibration, certification). Designated personnel amend the task " +
                          "data, then the amendment runs its own approval cycle before the change " +
                          "is finalised and the expiry is cleared.",
                Steps = new[]
                {
                    Draft(AmendmentOwners, "Amend the expired task data (role-based editing)"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Amendment review by the owning tier",
                        Status = ApprovalStatus.PendingAmendmentApproval,
                        Kind = WorkflowStepKind.Review,
                        EligibleRoles = AmendmentApprovers,
                        Signature = SignatureBlockType.ReviewedBy,
                        RequiresComments = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Manager (MGR) approval finalises the amendment and clears the expiry",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOrShopMgr,
                        Signature = SignatureBlockType.ApprovedBy
                    }
                }
            },

            // -----------------------------------------------------------------------------
            // (8) REVISION CYCLE  (requirement #12)
            //     Two-year cycle, or triggered when the CMM / Component Maintenance Task /
            //     Task Card is revised.
            // -----------------------------------------------------------------------------
            new FormWorkflowDefinition
            {
                FormType = RevisionCycleFormType,
                FormNo = FormNoRevisionCycle,
                Title = "Evaluation folder revision cycle",
                Section = ToCSections.FinalSignOff,
                Order = 2,
                IncludeInFolder = false,
                IsMandatory = false,
                DraftRoles = StlEngShopMgr,
                ExpiryMonths = 24,
                Remarks = "Standard two-year revision cycle, also raised automatically when the " +
                          "linked CMM, Component Maintenance Task or Task Card is revised. " +
                          "Coordinated approval: Shop Team Leader / Shop Manager -> Manager -> " +
                          "Department Director. Individual competencies (training completion " +
                          "dates) and the tool equivalency matrix are re-verified during the cycle.",
                Steps = new[]
                {
                    Draft(StlEngShopMgr, "Open the revision and update the affected records"),

                    new WorkflowStepDefinition
                    {
                        StepNo = 1,
                        Title = "Shop leadership updates competencies and the tool equivalency matrix",
                        Status = ApprovalStatus.PendingTeamLeaderReview,
                        Kind = WorkflowStepKind.Processing,
                        EligibleRoles = ShopLeadership,
                        RestrictToOriginatorShop = true,
                        Signature = SignatureBlockType.PreparedBy,
                        RequiresComments = true
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 2,
                        Title = "Manager (MGR) revision approval",
                        Status = ApprovalStatus.PendingManagerApproval,
                        Kind = WorkflowStepKind.Approval,
                        EligibleRoles = ManagerOrShopMgr,
                        Signature = SignatureBlockType.ReviewedBy
                    },
                    new WorkflowStepDefinition
                    {
                        StepNo = 3,
                        Title = "Department Director approves the revision and re-locks the folder",
                        Status = ApprovalStatus.PendingFinalSignOff,
                        Kind = WorkflowStepKind.SignOff,
                        EligibleRoles = Director,
                        Signature = SignatureBlockType.ApprovedBy,
                        AllowsDelegation = false
                    }
                }
            }
        };

        /// <summary>
        /// The three FACILITY REQUIREMENT EVALUATION forms share one chain, so it is built
        /// once here: Draft (STL / ENG / Shop Manager) -> Engineer measurement verification
        /// -> Shop Team Leader review -> QA acceptance -> Manager approval.
        /// The MNT-1325 gate re-verifies every facility metric before the folder is released.
        /// </summary>
        private static WorkflowStepDefinition[] FacilityChain(string subject) => new[]
        {
            Draft(StlEngShopMgr, $"Record the {subject} requirements and the measured values"),

            new WorkflowStepDefinition
            {
                StepNo = 1,
                Title = $"Engineer verifies the measured {subject} metrics against the CMM requirement",
                Status = ApprovalStatus.PendingEngineerAction,
                Kind = WorkflowStepKind.Verification,
                EligibleRoles = Engineer,
                AssignerRoles = StlAssigners,
                Signature = SignatureBlockType.VerifiedBy,
                RequiresComments = true
            },
            new WorkflowStepDefinition
            {
                StepNo = 2,
                Title = "Shop Team Leader review",
                Status = ApprovalStatus.PendingTeamLeaderReview,
                Kind = WorkflowStepKind.Review,
                EligibleRoles = ShopLeadership,
                RestrictToOriginatorShop = true,
                Signature = SignatureBlockType.ReviewedBy
            },
            new WorkflowStepDefinition
            {
                StepNo = 3,
                Title = "QA Personnel acceptance",
                Status = ApprovalStatus.PendingQAApproval,
                Kind = WorkflowStepKind.Approval,
                EligibleRoles = Qa,
                Signature = SignatureBlockType.SignedOffBy
            },
            new WorkflowStepDefinition
            {
                StepNo = 4,
                Title = "Manager (MGR) approval",
                Status = ApprovalStatus.PendingManagerApproval,
                Kind = WorkflowStepKind.Approval,
                EligibleRoles = ManagerOrShopMgr,
                Signature = SignatureBlockType.ApprovedBy
            }
        };
    }
}