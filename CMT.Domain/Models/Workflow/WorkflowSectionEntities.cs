using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v12 - WorkflowSectionEntities.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/WorkflowSectionEntities.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // v9 added the GENERIC engine tables (FormWorkflowInstance / FormWorkflowStep /
    // FormSignature / EvaluationFolder / EvaluationFolderItem / ExpiryTracking /
    // WorkflowNotification / CompetencyMatrixEntry / ToolEquivalencyMatrixEntry /
    // FolderRevisionLog) and v10 added the DOCUMENTATION routing tables
    // (DocumentationRoutingTicket / DocumentationClerkWorkload /
    // DocumentationAssignmentHistory / BulletinRegisterEntry / DirectiveComplianceEntry /
    // DocumentationLibraryLink).
    //
    // The DOCUMENTATION section is therefore complete. The REMAINING sections of the
    // Functional Workflow Matrix still have no persistence of their own, so the following
    // matrix rules are declared in the catalog but cannot be executed nor audited:
    //
    //   #4  "STL manually assigns the record to a designated Certifying Staff member",
    //       "Special Team Leader can assign records or update entries directly",
    //       "STL can reassign to lower-tier staff when workload is high"
    //       -> nothing records WHO the record was assigned to, by whom, and how many times
    //          it was re-assigned.                       => ATARecordAssignment
    //
    //   #6/#7 TNA MNT-1229B: "Drafted by STL or assigned to ENG; standard approval
    //       sequence MGR -> Special Team Leader; alternate-tool pathway drafted by ENG;
    //       conditional in-house manufacturing steps that can be skipped manually or
    //       auto-allocated based on form fields"
    //       -> the OUTPUT (which tool, alternate or not, in-house or not, approved by whom)
    //          has no row.                                => ToolNeedAnalysisEntry
    //                                                     => InhouseToolManufacturingRecord
    //
    //   Training block: "Shop Team Leader enrols all employees belonging to his shop only.
    //       To HR Specialist (Verification) -> HR Manager Approval -> Back to Requester STL",
    //       "HR Team updates training status records", "HR filters eligible employees"
    //       -> there is no enrolment row, so "his shop only" and "eligible" are
    //          unimplementable.                           => TrainingEnrollment
    //
    //   "Inspection Proficiency (MNT-1378) routed exclusively to the designated Inspector",
    //   "Competency Assessment (MNT-922C / MNT 3.14-020) routed directly to the Technician"
    //       -> "designated" needs a designation row.      => ProficiencyAssessmentAssignment
    //
    //   #Regulatory: "918 / 918A skip logic based on regulatory target dates" and
    //       "Joint Approval Path: DIR -> QA (MNT-918) -> ECAA Team (MNT-918A)"
    //       -> the regulatory decision trail has no row.  => RegulatoryComplianceRecord
    //
    //   "Step-by-Step Check: before final release the system presents MNT-1325 and each
    //       required page, tool equivalency and facility metric is verified step-by-step"
    //       -> FormWorkflowStep.ChecklistItemsJson is a blob; a gate finding must be
    //          queryable.                                 => SelfAuditVerificationItem
    //
    // ADDITIVE ONLY - HARD RULES RESPECTED
    //   - No existing entity, enum, status, role or permission is modified, renamed or
    //     renumbered. This file only ADDS tables.
    //   - Every USER id is long (never Guid); every ENTITY id is Guid. Same binding rule
    //     as WorkflowApiContracts.cs and DocumentationWorkflowEntities.cs.
    //   - Every link to the generic engine is FormWorkflowInstanceId, so a section row
    //     simply DECORATES a running instance and legacy queries keep working.
    //   - Links to legacy form rows (ToolNeedAnalysisReport, TrainingRecord, Form918FAA,
    //     Form918ACAA, PeriodicSelfAudit) are NULLABLE, so existing data stays valid.
    //   - No navigation property points at an entity of another aggregate, to keep the
    //     migration free of cascade surprises.
    //
    // MIGRATION
    //   dotnet ef migrations add AddSectionWorkflowTables --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    //   dotnet ef database update                         --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    //
    // COMPANION FILES OF THE v12 AMENDMENT
    //   CMT.Domain/Models/Workflow/WorkflowPermissionMatrix.cs              (global matrix)
    //   CMT.Application.SelfEvaluation/Contracts/Workflow/DocumentationApiContracts.cs     (doc endpoints)
    //   CMT.Application.SelfEvaluation/Contracts/Workflow/SectionApiContracts.cs           (other endpoints)
    //   CMT.Frontend/src/lib/role-hierarchy.ts                              (frontend mirror)
    //   docs/AMENDMENT_v12_CONTRACTS.md                                    (tables + matrix + API)
    //   docs/AMENDMENT_v12_APPLICATIONDBCONTEXT.md                         (the 2 edits to apply)
    // =====================================================================================

    /// <summary>
    /// Why an ATA record / form was handed to somebody else. Distinct from
    /// <see cref="WorkflowStepAction"/>, which says WHAT happened; this says WHY.
    /// </summary>
    public enum AssignmentReason
    {
        /// <summary>Normal designation of the responsible staff member.</summary>
        Designation = 0,

        /// <summary>"Shop Team Leaders can assign these to lower-tier staff if workload is high."</summary>
        HighWorkload = 1,

        /// <summary>The previous assignee is absent.</summary>
        Absence = 2,

        /// <summary>"A Special Team Leader can assign records or update entries directly."</summary>
        SpecialTeamLeaderDirectAction = 3,

        /// <summary>Rework after a rejection / return.</summary>
        Rework = 4,

        /// <summary>Load balancing inside a central functional unit.</summary>
        LoadBalancing = 5
    }

    /// <summary>Lifecycle of one training enrolment inside the HR chain.</summary>
    public enum TrainingEnrollmentState
    {
        /// <summary>The STL is still building the enrolment list.</summary>
        Draft = 0,

        /// <summary>Submitted by the STL and waiting for HR Specialist verification.</summary>
        SubmittedToHR = 1,

        /// <summary>The HR Specialist verified the employee and updated the status record.</summary>
        VerifiedByHR = 2,

        /// <summary>The HR Specialist marked the employee NOT eligible (filtered out).</summary>
        RejectedByHR = 3,

        /// <summary>Included in the package approved by the HR Manager.</summary>
        ApprovedByHRManager = 4,

        /// <summary>Returned to the requesting STL for final training verification.</summary>
        ReturnedToRequester = 5,

        /// <summary>The STL confirmed the training verification: the row is final.</summary>
        VerifiedByRequester = 6,

        /// <summary>The validity window elapsed; an amendment cycle is required.</summary>
        Expired = 7
    }

    /// <summary>Outcome of one MNT-1325 checklist item of the final release gate.</summary>
    public enum VerificationOutcome
    {
        NotVerified = 0,
        Verified = 1,
        Finding = 2,
        NotApplicable = 3
    }

    /// <summary>What a MNT-1325 checklist item verifies.</summary>
    public enum SelfAuditItemKind
    {
        /// <summary>"Each required page" of the evaluation folder.</summary>
        RequiredPage = 0,

        /// <summary>"Tool equivalency" row of the tool equivalency matrix.</summary>
        ToolEquivalency = 1,

        /// <summary>"Facility metric" of the facility requirement evaluation.</summary>
        FacilityMetric = 2,

        /// <summary>Training / competency coverage of the shop personnel.</summary>
        TrainingCoverage = 3,

        /// <summary>Consumables availability and alternate declarations.</summary>
        Consumable = 4,

        /// <summary>Documentation coverage (CMM, SB, AD, task cards).</summary>
        Documentation = 5
    }

    // =====================================================================================
    // 1. ATARecordAssignment  ->  table ATARecordAssignments
    //    Requirement #4, made auditable.
    // =====================================================================================

    /// <summary>
    /// One assignment / re-assignment event of a New ATA Record (or of the record-level
    /// workflow instance). The CURRENT owner is the row with <see cref="IsCurrent"/> = true.
    /// </summary>
    public class ATARecordAssignment
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        /// <summary>Running instance of the ATA record chain (ATARecordFormType).</summary>
        public Guid? FormWorkflowInstanceId { get; set; }

        public Guid? EvaluationFolderId { get; set; }

        /// <summary>Owning shop. An STL may only ever assign inside his own shop.</summary>
        public Guid? ShopId { get; set; }

        /// <summary>Sequence inside the record, starting at 1.</summary>
        public int Sequence { get; set; }

        /// <summary>Step of the generic chain this assignment belongs to.</summary>
        public int StepNo { get; set; }

        // ----- Who assigned -----

        public long AssignedByUserId { get; set; }

        [MaxLength(200)]
        public string AssignedByName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value: TeamLeader, ShopManager or SpecialTeamLeader.</summary>
        [MaxLength(50)]
        public string AssignedByRole { get; set; } = string.Empty;

        // ----- Who receives -----

        public long AssignedToUserId { get; set; }

        [MaxLength(200)]
        public string AssignedToName { get; set; } = string.Empty;

        /// <summary>
        /// Canonical OrgRoles value of the assignee. The standard designation of the matrix
        /// is OrgRoles.CertifyingStaff; a high-workload re-assignment may target any
        /// strictly less senior role of the same shop.
        /// </summary>
        [MaxLength(50)]
        public string AssignedToRole { get; set; } = string.Empty;

        /// <summary>Shop of the assignee, so a cross-shop assignment is detectable.</summary>
        public Guid? AssignedToShopId { get; set; }

        // ----- Nature of the event -----

        public WorkflowStepAction Action { get; set; } = WorkflowStepAction.Assigned;

        public AssignmentReason Reason { get; set; } = AssignmentReason.Designation;

        /// <summary>True when this is a delegation to LOWER-TIER staff (workload rule).</summary>
        public bool IsLowerTierDelegation { get; set; }

        /// <summary>
        /// True when a Special Team Leader assigned or updated the entry DIRECTLY, i.e.
        /// without going through the STL. Kept explicit because it bypasses the shop scope.
        /// </summary>
        public bool IsSpecialTeamLeaderDirectAction { get; set; }

        /// <summary>Previous owner, when this row supersedes an earlier assignment.</summary>
        public long? PreviousAssigneeUserId { get; set; }

        public Guid? SupersedesAssignmentId { get; set; }

        /// <summary>Exactly one row per record should carry true.</summary>
        public bool IsCurrent { get; set; } = true;

        public bool IsAccepted { get; set; }
        public DateTime? AcceptedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        [MaxLength(500)]
        public string Notes { get; set; } = string.Empty;

        public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 2. TrainingEnrollment  ->  table TrainingEnrollments
    //    STL (own shop only) -> HR Specialist verification -> HR Manager approval ->
    //    back to the requesting STL.
    // =====================================================================================

    /// <summary>
    /// One enrolled employee of one training request. The STL creates the rows, the HR
    /// Specialist verifies and filters them, the HR Manager approves the surviving set and
    /// the requesting STL performs the final training verification.
    /// </summary>
    public class TrainingEnrollment
    {
        public Guid Id { get; set; }

        /// <summary>Running instance of the training form.</summary>
        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>Legacy TrainingRecord row, when the training already has one.</summary>
        public Guid? TrainingRecordId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }

        /// <summary>
        /// Shop of the REQUESTING Shop Team Leader. The enforcement point of
        /// "Shop Team Leader enrols all employees belonging to his shop only":
        /// EmployeeShopId must equal RequesterShopId.
        /// </summary>
        public Guid RequesterShopId { get; set; }

        public long RequesterUserId { get; set; }

        [MaxLength(200)]
        public string RequesterName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value of the requester (TeamLeader / ShopManager).</summary>
        [MaxLength(50)]
        public string RequesterRole { get; set; } = string.Empty;

        // ----- The enrolled employee -----

        public long EmployeeUserId { get; set; }

        [MaxLength(200)]
        public string EmployeeName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string EmployeeNo { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value of the employee.</summary>
        [MaxLength(50)]
        public string EmployeeRole { get; set; } = string.Empty;

        /// <summary>Shop of the employee. Must match RequesterShopId.</summary>
        public Guid? EmployeeShopId { get; set; }

        // ----- The training -----

        /// <summary>FormNodeTypes value of the training form that owns the enrolment.</summary>
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        [MaxLength(100)]
        public string TrainingCode { get; set; } = string.Empty;

        [MaxLength(300)]
        public string TrainingTitle { get; set; } = string.Empty;

        [MaxLength(200)]
        public string TrainingProvider { get; set; } = string.Empty;

        /// <summary>
        /// "Simple / Similar Tasks (Skip Logic): if training is not required, bypass full
        /// evaluation and route directly to Team Leader for quick review."
        /// Mirrors FormDataJson.trainingRequired, so the engine can auto-skip the HR steps.
        /// </summary>
        public bool TrainingRequired { get; set; } = true;

        [MaxLength(500)]
        public string NotRequiredJustification { get; set; } = string.Empty;

        // ----- HR Specialist verification -----

        public TrainingEnrollmentState State { get; set; } = TrainingEnrollmentState.Draft;

        public long? VerifiedByHRUserId { get; set; }

        [MaxLength(200)]
        public string VerifiedByHRName { get; set; } = string.Empty;

        public DateTime? VerifiedAt { get; set; }

        /// <summary>Training status value written by the HR Team ("HR updates training status records").</summary>
        [MaxLength(100)]
        public string TrainingStatus { get; set; } = string.Empty;

        public DateTime? TrainingCompletedDate { get; set; }

        /// <summary>TrainingCompletedDate + the catalog ExpiryMonths (24 by default).</summary>
        public DateTime? TrainingExpiryDate { get; set; }

        public ProficiencyLevel Level { get; set; } = ProficiencyLevel.NotRated;

        /// <summary>Result of the HR filter: "HR filters eligible employees".</summary>
        public bool IsEligible { get; set; }

        [MaxLength(500)]
        public string IneligibleReason { get; set; } = string.Empty;

        // ----- HR Manager approval -----

        public long? ApprovedByHRManagerUserId { get; set; }

        [MaxLength(200)]
        public string ApprovedByHRManagerName { get; set; } = string.Empty;

        public DateTime? HRManagerApprovedAt { get; set; }

        // ----- Return to the requesting STL -----

        public DateTime? ReturnedToRequesterAt { get; set; }

        public long? RequesterVerifiedByUserId { get; set; }

        public DateTime? RequesterVerifiedAt { get; set; }

        // ----- Validity -----

        public bool IsExpired { get; set; }

        /// <summary>ExpiryTracking row created for this enrolment.</summary>
        public Guid? ExpiryTrackingId { get; set; }

        /// <summary>CompetencyMatrixEntry row produced on final verification.</summary>
        public Guid? CompetencyMatrixEntryId { get; set; }

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        /// <summary>
        /// The enforcement helper of the shop rule. The engine calls it before accepting
        /// an enrolment row created by a Shop Team Leader.
        /// </summary>
        public bool BelongsToRequesterShop() =>
            EmployeeShopId.HasValue && EmployeeShopId.Value == RequesterShopId;
    }

    // =====================================================================================
    // 3. ProficiencyAssessmentAssignment  ->  table ProficiencyAssessmentAssignments
    //    MNT-1378 "routed exclusively to the DESIGNATED Inspector"
    //    MNT-922C / MNT 3.14-020 "routed directly to the Technician".
    // =====================================================================================

    /// <summary>
    /// The designation behind the exclusive routing of the proficiency / competency forms.
    /// One row per assessed person and per assessment form instance.
    /// </summary>
    public class ProficiencyAssessmentAssignment
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>FormNodeTypes.InspectorProficiency or FormNodeTypes.CompetencyAssessment.</summary>
        [Required]
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        /// <summary>MNT-1378 or "MNT-922C / MNT 3.14-020".</summary>
        [MaxLength(50)]
        public string FormNo { get; set; } = string.Empty;

        public Guid? EvaluationFolderId { get; set; }
        public Guid ShopId { get; set; }

        /// <summary>Legacy EmployeeProficiencyRecord row, when one exists.</summary>
        public Guid? EmployeeProficiencyRecordId { get; set; }

        // ----- The designated actor (Inspector or Technician) -----

        public long DesignatedUserId { get; set; }

        [MaxLength(200)]
        public string DesignatedName { get; set; } = string.Empty;

        /// <summary>
        /// Canonical OrgRoles value. MUST be OrgRoles.Inspector for MNT-1378 and
        /// OrgRoles.Technician for MNT-922C / MNT 3.14-020: this is what makes the routing
        /// EXCLUSIVE instead of merely role-based.
        /// </summary>
        [MaxLength(50)]
        public string DesignatedRole { get; set; } = string.Empty;

        public long DesignatedByUserId { get; set; }

        [MaxLength(50)]
        public string DesignatedByRole { get; set; } = string.Empty;

        public DateTime DesignatedAt { get; set; } = DateTime.UtcNow;

        // ----- The assessed person (may be the designated person for a self sign-off) -----

        public long AssessedUserId { get; set; }

        [MaxLength(200)]
        public string AssessedName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string AssessedRole { get; set; } = string.Empty;

        [MaxLength(300)]
        public string AssessedTask { get; set; } = string.Empty;

        // ----- Execution -----

        /// <summary>Sequential review step of MNT-1378, or the Technician sign-off step.</summary>
        public DateTime? ReviewedAt { get; set; }

        public DateTime? ApprovedAt { get; set; }

        public ProficiencyLevel AwardedLevel { get; set; } = ProficiencyLevel.NotRated;

        public VerificationOutcome Outcome { get; set; } = VerificationOutcome.NotVerified;

        /// <summary>True when the assessed person signed the task completion himself.</summary>
        public bool TaskCompletionSignedOff { get; set; }

        public DateTime? TaskCompletionSignedAt { get; set; }

        /// <summary>FormSignature row of the closing signature.</summary>
        public Guid? SignatureId { get; set; }

        public DateTime? ValidUntil { get; set; }

        public Guid? ExpiryTrackingId { get; set; }

        [MaxLength(1000)]
        public string Findings { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 4. ToolNeedAnalysisEntry  ->  table ToolNeedAnalysisEntries
    //    The OUTPUT of TNA MNT-1229B: one analysed tool, its alternate / in-house route,
    //    and the MGR -> Special Team Leader approval trail.
    // =====================================================================================

    /// <summary>One tool line of a Tool Need Analysis (MNT-1229B) and its approval trail.</summary>
    public class ToolNeedAnalysisEntry
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>Legacy ToolNeedAnalysisReport row, when one exists.</summary>
        public Guid? ToolNeedAnalysisReportId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        /// <summary>FormNodeTypes.TNA / ToolNeedAnalysisReport / AlternateToolsEquivalency.</summary>
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        // ----- The required tool as listed by the CMM -----

        [Required]
        [MaxLength(200)]
        public string RequiredToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string RequiredToolDescription { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CmmReference { get; set; } = string.Empty;

        public int Quantity { get; set; } = 1;

        public ToolStatus Status { get; set; } = ToolStatus.Required;

        // ----- Drafting: "Drafted directly by the STL or assigned to an Engineer" -----

        public long DraftedByUserId { get; set; }

        [MaxLength(200)]
        public string DraftedByName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value: TeamLeader or Engineer.</summary>
        [MaxLength(50)]
        public string DraftedByRole { get; set; } = string.Empty;

        /// <summary>True when the STL delegated the drafting to an Engineer (assignToEngineer).</summary>
        public bool AssignedToEngineer { get; set; }

        public long? AssignedEngineerUserId { get; set; }

        [MaxLength(200)]
        public string AssignedEngineerName { get; set; } = string.Empty;

        public DateTime? EngineerCompletedAt { get; set; }

        // ----- Skip-logic inputs (mirrored from FormDataJson) -----

        /// <summary>FormDataJson.alternateToolUsed - opens the alternate-tool pathway.</summary>
        public bool AlternateToolUsed { get; set; }

        /// <summary>FormDataJson.inhouseManufacturingRequired - keeps the in-house steps alive.</summary>
        public bool InhouseManufacturingRequired { get; set; }

        /// <summary>True when the in-house block was skipped (manually or automatically).</summary>
        public bool InhouseStepsSkipped { get; set; }

        public bool InhouseStepsSkippedAutomatically { get; set; }

        [MaxLength(500)]
        public string InhouseSkipReason { get; set; } = string.Empty;

        // ----- Alternate tool (MNT-1229C) -----

        [MaxLength(200)]
        public string AlternateToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AlternateToolDescription { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string EquivalencyBasis { get; set; } = string.Empty;

        /// <summary>ToolEquivalencyMatrixEntry produced by the approved alternate route.</summary>
        public Guid? ToolEquivalencyMatrixEntryId { get; set; }

        // ----- Standard approval sequence: Manager -> Special Team Leader -----

        public long? ManagerApprovedByUserId { get; set; }

        [MaxLength(200)]
        public string ManagerApprovedByName { get; set; } = string.Empty;

        public DateTime? ManagerApprovedAt { get; set; }

        /// <summary>
        /// The Special Team Leader approval that CLOSES the sequence, both for the standard
        /// path and for the alternate-tool pathway drafted by the Engineer.
        /// </summary>
        public long? SpecialTeamLeaderApprovedByUserId { get; set; }

        [MaxLength(200)]
        public string SpecialTeamLeaderApprovedByName { get; set; } = string.Empty;

        public DateTime? SpecialTeamLeaderApprovedAt { get; set; }

        public Guid? ApprovalSignatureId { get; set; }

        public bool IsApproved { get; set; }
        public bool IsLocked { get; set; }

        // ----- Calibration, feeding the expiry tracker -----

        [MaxLength(100)]
        public string CalibrationInterval { get; set; } = string.Empty;

        public DateTime? LastCalibrationDate { get; set; }
        public DateTime? CalibrationDueDate { get; set; }

        public Guid? ExpiryTrackingId { get; set; }

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // =====================================================================================
    // 5. InhouseToolManufacturingRecord  ->  table InhouseToolManufacturingRecords
    //    The conditional in-house block (MNT-1229D / MNT-1229E JIC / MNT-1229F risk /
    //    MNT-1554) that "can be dynamically skipped by the user or auto-allocated based on
    //    form fields".
    // =====================================================================================

    /// <summary>One in-house manufactured tool and the conditional steps it went through.</summary>
    public class InhouseToolManufacturingRecord
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>The TNA line that requested the in-house manufacturing.</summary>
        public Guid? ToolNeedAnalysisEntryId { get; set; }

        /// <summary>Legacy InhouseManufacturedToolsCard row, when one exists.</summary>
        public Guid? InhouseManufacturedToolsCardId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid ShopId { get; set; }

        [Required]
        [MaxLength(200)]
        public string ToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ToolDescription { get; set; } = string.Empty;

        [MaxLength(100)]
        public string LocalToolNumber { get; set; } = string.Empty;

        [MaxLength(200)]
        public string DrawingNumber { get; set; } = string.Empty;

        // ----- Conditional steps: each one may be skipped or auto-allocated -----

        /// <summary>MNT-1229E: the Job Instruction Card.</summary>
        public bool JicRequired { get; set; } = true;
        public bool JicSkipped { get; set; }
        public bool JicSkippedAutomatically { get; set; }
        public DateTime? JicCompletedAt { get; set; }
        public long? JicCompletedByUserId { get; set; }

        /// <summary>MNT-1229F: the risk assessment.</summary>
        public bool RiskAssessmentRequired { get; set; } = true;
        public bool RiskAssessmentSkipped { get; set; }
        public bool RiskAssessmentSkippedAutomatically { get; set; }
        public DateTime? RiskAssessmentCompletedAt { get; set; }
        public long? RiskAssessmentCompletedByUserId { get; set; }

        /// <summary>MNT-1554: the manufacturing release form.</summary>
        public bool Form1554Required { get; set; } = true;
        public bool Form1554Skipped { get; set; }
        public bool Form1554SkippedAutomatically { get; set; }
        public DateTime? Form1554CompletedAt { get; set; }
        public long? Form1554CompletedByUserId { get; set; }

        /// <summary>Comma separated audit trail of every skip reason of this record.</summary>
        [MaxLength(1000)]
        public string SkipAuditTrail { get; set; } = string.Empty;

        // ----- Approval: routes to the Special Team Leader -----

        public long? SpecialTeamLeaderApprovedByUserId { get; set; }

        [MaxLength(200)]
        public string SpecialTeamLeaderApprovedByName { get; set; } = string.Empty;

        public DateTime? SpecialTeamLeaderApprovedAt { get; set; }

        public Guid? ApprovalSignatureId { get; set; }

        public bool IsApproved { get; set; }
        public bool IsLocked { get; set; }

        public ToolStatus Status { get; set; } = ToolStatus.Required;

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // =====================================================================================
    // 6. RegulatoryComplianceRecord  ->  table RegulatoryComplianceRecords
    //    918 / 918A: the "Optional / May Skip Now" decision and the joint approval path
    //    DIR -> QA (MNT-918) -> ECAA (MNT-918A).
    // =====================================================================================

    /// <summary>
    /// The regulatory decision trail of one evaluation folder: whether the 918 / 918A pair
    /// was deferred, when the joint path was enabled, and who signed each stage.
    /// </summary>
    public class RegulatoryComplianceRecord
    {
        public Guid Id { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }

        /// <summary>Instance of MNT-918 (the primary form of the pair).</summary>
        public Guid? PrimaryInstanceId { get; set; }

        /// <summary>Instance of MNT-918A generated by the joint path.</summary>
        public Guid? CompanionInstanceId { get; set; }

        /// <summary>Legacy Form918FAA row, when one exists.</summary>
        public Guid? Form918FAAId { get; set; }

        /// <summary>Legacy Form918ACAA row, when one exists.</summary>
        public Guid? Form918ACAAId { get; set; }

        // ----- "Optional / May Skip Now" flag -----

        /// <summary>Regulatory target date driving SkipMode.RegulatoryDate.</summary>
        public DateTime? RegulatoryTargetDate { get; set; }

        /// <summary>True while the target date is still in the future (or unset).</summary>
        public bool MaySkipNow { get; set; } = true;

        public bool WasDeferred { get; set; }

        public DateTime? DeferredAt { get; set; }

        public long? DeferredByUserId { get; set; }

        [MaxLength(50)]
        public string DeferredByRole { get; set; } = string.Empty;

        [MaxLength(500)]
        public string DeferralReason { get; set; } = string.Empty;

        // ----- Joint approval path -----

        public bool JointApprovalEnabled { get; set; }

        public DateTime? JointApprovalEnabledAt { get; set; }

        public long? JointApprovalEnabledByUserId { get; set; }

        /// <summary>Stage 1 - Director.</summary>
        public long? DirectorApprovedByUserId { get; set; }

        [MaxLength(200)]
        public string DirectorApprovedByName { get; set; } = string.Empty;

        public DateTime? DirectorApprovedAt { get; set; }

        /// <summary>Stage 2 - QA Personnel signs MNT-918.</summary>
        public long? QaApprovedByUserId { get; set; }

        [MaxLength(200)]
        public string QaApprovedByName { get; set; } = string.Empty;

        public DateTime? QaApprovedAt { get; set; }

        /// <summary>Stage 3 - ECAA Team endorses MNT-918A.</summary>
        public long? EcaaEndorsedByUserId { get; set; }

        [MaxLength(200)]
        public string EcaaEndorsedByName { get; set; } = string.Empty;

        public DateTime? EcaaEndorsedAt { get; set; }

        [MaxLength(100)]
        public string EcaaReferenceNumber { get; set; } = string.Empty;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        public ApprovalStatus Status { get; set; } = ApprovalStatus.Draft;

        public bool IsComplete { get; set; }
        public bool IsLocked { get; set; }

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // =====================================================================================
    // 7. SelfAuditVerificationItem  ->  table SelfAuditVerificationItems
    //    MNT-1325 step-by-step gate: "each required page, tool equivalency and facility
    //    metric is verified step-by-step" before the final release.
    // =====================================================================================

    /// <summary>
    /// One verified item of the MNT-1325 Periodic Capability Self-Audit gate. The gate step
    /// cannot be completed while any mandatory item is still NotVerified.
    /// </summary>
    public class SelfAuditVerificationItem
    {
        public Guid Id { get; set; }

        /// <summary>Instance of MNT-1325 (or of the folder sign-off chain carrying the gate).</summary>
        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>Gate step number inside that instance.</summary>
        public int StepNo { get; set; }

        public Guid? EvaluationFolderId { get; set; }

        /// <summary>Legacy PeriodicSelfAudit / SelfAuditChecklist row, when one exists.</summary>
        public Guid? PeriodicSelfAuditId { get; set; }

        public SelfAuditItemKind Kind { get; set; } = SelfAuditItemKind.RequiredPage;

        /// <summary>Stable code, e.g. "PAGE-07", "TOOL-EQ-03", "FAC-TEMP".</summary>
        [Required]
        [MaxLength(50)]
        public string ItemCode { get; set; } = string.Empty;

        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        public int SequenceNo { get; set; }

        public bool IsMandatory { get; set; } = true;

        /// <summary>Row of the folder Table Of Contents this item verifies, when applicable.</summary>
        public Guid? EvaluationFolderItemId { get; set; }

        /// <summary>Tool equivalency row this item verifies, when Kind = ToolEquivalency.</summary>
        public Guid? ToolEquivalencyMatrixEntryId { get; set; }

        /// <summary>Expected value / metric target printed on MNT-1325.</summary>
        [MaxLength(300)]
        public string ExpectedValue { get; set; } = string.Empty;

        [MaxLength(300)]
        public string ActualValue { get; set; } = string.Empty;

        public VerificationOutcome Outcome { get; set; } = VerificationOutcome.NotVerified;

        public bool IsVerified { get; set; }

        public long? VerifiedByUserId { get; set; }

        [MaxLength(200)]
        public string VerifiedByName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string VerifiedByRole { get; set; } = string.Empty;

        public DateTime? VerifiedAt { get; set; }

        /// <summary>Mandatory when Outcome is Finding.</summary>
        [MaxLength(1000)]
        public string Finding { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string CorrectiveAction { get; set; } = string.Empty;

        public bool FindingClosed { get; set; }

        public DateTime? FindingClosedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 8. WorkflowDelegationLog  ->  table WorkflowDelegationLogs
    //    "supporting ... delegation to lower-tier staff" for EVERY form, not just ATA
    //    records, so requirement #3 has one queryable delegation history.
    // =====================================================================================

    /// <summary>One delegation of a pending step to a strictly less senior user.</summary>
    public class WorkflowDelegationLog
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        public Guid? FormWorkflowStepId { get; set; }

        public int StepNo { get; set; }

        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ShopId { get; set; }

        public long DelegatedByUserId { get; set; }

        [MaxLength(200)]
        public string DelegatedByName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string DelegatedByRole { get; set; } = string.Empty;

        public long DelegatedToUserId { get; set; }

        [MaxLength(200)]
        public string DelegatedToName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string DelegatedToRole { get; set; } = string.Empty;

        /// <summary>Seniority rank of the delegate; must be greater than the delegator rank.</summary>
        public int DelegateRank { get; set; }

        public AssignmentReason Reason { get; set; } = AssignmentReason.HighWorkload;

        [MaxLength(500)]
        public string ReasonText { get; set; } = string.Empty;

        public DateTime DelegatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? RevokedAt { get; set; }

        public long? RevokedByUserId { get; set; }

        public DelegationStatus Status { get; set; } = DelegationStatus.Active;

        public DateTime? ExpiresAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}