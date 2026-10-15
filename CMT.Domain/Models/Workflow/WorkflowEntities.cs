using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v9 - WorkflowEntities.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/WorkflowEntities.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // Your v9 files (WorkflowContracts.cs + the five FormWorkflowCatalog parts) are a
    // DECLARATIVE layer only: they describe, per form, "who acts, in which order, which
    // signature line is filled, and when a step may be skipped".
    //
    // Nothing PERSISTS that declaration yet, therefore today:
    //   - a form has no executed step history  -> requirement #3 (audit log, "Prepared by /
    //     Reviewed by / Approved by / Dates" auto-filled) cannot be satisfied;
    //   - there is no evaluation folder row    -> requirement #2 (folder + Table of Contents
    //     with live per-form status) cannot be rendered;
    //   - there is no expiry row               -> requirement #10 cannot notify anybody;
    //   - there is no completion counter       -> requirement #11 cannot mark Complete nor
    //     consolidate the PDF;
    //   - there is no revision log             -> requirement #12 two-year cycle is invisible.
    //
    // This file adds those 10 tables. It is ADDITIVE ONLY:
    //   - no existing entity is modified (FormSubmission, ATARecord, WorkflowAuditLog,
    //     TableOfContent ... all stay exactly as they are);
    //   - FormWorkflowInstance carries FormSubmissionId, so an instance simply DECORATES an
    //     existing FormSubmission row and every legacy query keeps working;
    //   - the folder-level virtual forms (FolderSignOffFormType / AmendmentCycleFormType /
    //     RevisionCycleFormType, declared in FormWorkflowCatalog.Regulatory.cs) have NO
    //     FormSubmission row, which is why FormSubmissionId is nullable.
    //
    // MIGRATION
    //   dotnet ef migrations add AddWorkflowEngineTables
    //   dotnet ef database update
    //
    // COMPANION FILES
    //   CMT.Domain/Data/ApplicationDbContext.Workflow.cs      (DbSets + mapping)
    //   CMT.Application.SelfEvaluation/Contracts/Workflow/WorkflowApiContracts.cs (request / response DTOs)
    //   CMT.Application.SelfEvaluation/Services/FormWorkflowEngine.cs        (the engine that writes them)
    //   docs/AMENDMENT_v9_CONTRACTS.md                       (tables + role matrix + API)
    // =====================================================================================

    /// <summary>
    /// Execution state of ONE materialised step. Distinct from
    /// <see cref="ApprovalStatus"/>: ApprovalStatus says WHERE the record is parked,
    /// WorkflowStepState says what happened TO THIS STEP.
    /// </summary>
    public enum WorkflowStepState
    {
        /// <summary>Not reached yet.</summary>
        NotStarted = 0,

        /// <summary>Reached, waiting for the assignee to be chosen.</summary>
        AwaitingAssignment = 1,

        /// <summary>Reached and actionable now.</summary>
        Active = 2,

        /// <summary>Executed successfully (approved / verified / signed / endorsed).</summary>
        Completed = 3,

        /// <summary>Bypassed by skip logic (manual, auto or regulatory date).</summary>
        Skipped = 4,

        /// <summary>Rejected here; the form went back to the originator.</summary>
        Rejected = 5,

        /// <summary>Returned to a previous step for rework.</summary>
        Returned = 6
    }

    /// <summary>Why a revision cycle was raised (requirement #12).</summary>
    public enum RevisionTrigger
    {
        /// <summary>Standard two-year revision cycle of the evaluation folder.</summary>
        TwoYearCycle = 0,

        /// <summary>The linked Component Maintenance Manual was revised.</summary>
        CmmRevised = 1,

        /// <summary>The linked Component Maintenance Task was revised.</summary>
        ComponentMaintenanceTaskRevised = 2,

        /// <summary>A linked Task Card was revised.</summary>
        TaskCardRevised = 3,

        /// <summary>Raised manually by an authorised role.</summary>
        Manual = 4
    }

    /// <summary>Notification buckets of the in-app notification centre (requirement #10).</summary>
    public static class NotificationCategories
    {
        public const string Assignment = "Assignment";
        public const string Approval = "Approval";
        public const string Rejection = "Rejection";
        public const string Expiry = "Expiry";
        public const string Amendment = "Amendment";
        public const string Revision = "Revision";
        public const string Completion = "Completion";
    }

    // =====================================================================================
    // 1. FormWorkflowInstance  -> table WorkflowInstances
    //    One row per running form. Materialises FormWorkflowCatalog.StepsFor(formType) so
    //    the executed chain stays auditable even after the catalog is revised.
    // =====================================================================================

    /// <summary>
    /// A running instance of one catalogued form. Decorates a <c>FormSubmission</c> row
    /// (or stands alone for the folder-level virtual forms).
    /// </summary>
    public class FormWorkflowInstance
    {
        public Guid Id { get; set; }

        /// <summary>
        /// The decorated FormSubmission. NULL for the folder-level virtual forms
        /// (evaluation_folder_signoff / expiry_amendment / folder_revision).
        /// </summary>
        public Guid? FormSubmissionId { get; set; }

        /// <summary>Owning evaluation folder (requirement #2). NULL for a stand-alone form.</summary>
        public Guid? EvaluationFolderId { get; set; }

        /// <summary>Owning ATA / Component record.</summary>
        public Guid? ATARecordId { get; set; }

        /// <summary>Shop scope. Used by RestrictToOriginatorShop and by the inbox queries.</summary>
        public Guid? ShopId { get; set; }

        /// <summary>FormNodeTypes value or one of the virtual form types of the catalog.</summary>
        [Required]
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        /// <summary>Printed form number copied from the catalog (e.g. "MNT-1420A").</summary>
        [MaxLength(50)]
        public string FormNo { get; set; } = string.Empty;

        /// <summary>ToCSections code copied from the catalog.</summary>
        [MaxLength(100)]
        public string Section { get; set; } = string.Empty;

        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        // ----- Live position in the chain -----

        public ApprovalStatus Status { get; set; } = ApprovalStatus.Draft;

        /// <summary>Step currently pending. 0 while the form is still a draft.</summary>
        public int CurrentStepNo { get; set; }

        /// <summary>Resolved assignee of the pending step ("Pending my action" inbox).</summary>
        public long? CurrentAssigneeUserId { get; set; }

        /// <summary>
        /// Central unit owning the pending step (FunctionalUnits.Documentation /
        /// FunctionalUnits.HumanResources). NULL when the queue is the originator's shop.
        /// </summary>
        [MaxLength(50)]
        public string? CurrentAssignmentUnit { get; set; }

        // ----- Originator -----

        public long OriginatorUserId { get; set; }

        [MaxLength(50)]
        public string OriginatorRole { get; set; } = string.Empty;

        [MaxLength(200)]
        public string OriginatorName { get; set; } = string.Empty;

        /// <summary>Shop of the originator, frozen at draft time.</summary>
        public Guid? OriginatorShopId { get; set; }

        public DateTime? SubmittedAt { get; set; }
        public DateTime? CompletedAt { get; set; }

        /// <summary>Every step is Completed or Skipped and the last step was executed.</summary>
        public bool IsComplete { get; set; }

        /// <summary>Signed off and locked: only a revision / amendment cycle may reopen it.</summary>
        public bool IsLocked { get; set; }

        // ----- Skip logic inputs (918 / 918A, in-house tools, training) -----

        /// <summary>
        /// Regulatory target date driving SkipMode.RegulatoryDate
        /// ("Optional / May Skip Now" flag of the 918 / 918A forms).
        /// </summary>
        public DateTime? RegulatoryTargetDate { get; set; }

        /// <summary>True once the joint approval path DIR -> QA -> ECAA is enabled.</summary>
        public bool JointApprovalEnabled { get; set; }

        /// <summary>Companion instance generated by the joint path (918 FAA -> 918A CAA).</summary>
        public Guid? JointApprovalCompanionInstanceId { get; set; }

        /// <summary>
        /// Flattened camelCase snapshot of FormDataJson used to evaluate the automatic skip
        /// conditions, kept so a re-evaluation is reproducible in the audit trail.
        /// </summary>
        public string FormFieldsSnapshotJson { get; set; } = "{}";

        // ----- Validity / revision -----

        /// <summary>Catalog ExpiryMonths at creation time (24 training, 12 calibration...).</summary>
        public int? ExpiryMonths { get; set; }

        /// <summary>Computed on final approval: ApprovedAt + ExpiryMonths.</summary>
        public DateTime? ExpiresAt { get; set; }

        public int RevisionNumber { get; set; } = 1;

        /// <summary>Instance this one supersedes after an amendment / revision cycle.</summary>
        public Guid? SupersedesInstanceId { get; set; }

        // ----- Audit -----

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // ----- Navigation -----

        public ICollection<FormWorkflowStep> Steps { get; set; } = new List<FormWorkflowStep>();
        public ICollection<FormSignature> Signatures { get; set; } = new List<FormSignature>();
    }

    // =====================================================================================
    // 2. FormWorkflowStep  -> table WorkflowSteps
    //    The per-form step table of requirement #3, materialised 1:1 from
    //    WorkflowStepDefinition and then filled in as the chain executes.
    // =====================================================================================

    /// <summary>
    /// One materialised step. The DEFINITION columns are copied from the catalog at
    /// creation time; the EXECUTION columns are written when the step is acted on.
    /// </summary>
    public class FormWorkflowStep
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }
        
        public Guid? UserSignatureId { get; set; }
public string? SignatureStoragePath { get; set; }
public bool SignatureImageApplied { get; set; }

        // ----- Definition (frozen copy of WorkflowStepDefinition) -----

        /// <summary>0 = the drafting step.</summary>
        public int StepNo { get; set; }

        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        /// <summary>Status the instance sits in WHILE this step is pending.</summary>
        public ApprovalStatus PendingStatus { get; set; }

        public WorkflowStepKind Kind { get; set; }

        public SignatureBlockType SignatureBlock { get; set; }

        /// <summary>Canonical OrgRoles allowed to execute the step, comma separated.</summary>
        [MaxLength(500)]
        public string EligibleRolesCsv { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles allowed to assign / re-assign, comma separated.</summary>
        [MaxLength(500)]
        public string AssignerRolesCsv { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? AssignmentUnit { get; set; }

        public bool RequiresManualAssignment { get; set; }
        public bool RestrictToOriginatorShop { get; set; }
        public bool AllowsDelegation { get; set; } = true;
        public bool RequiresComments { get; set; }
        public bool IsStepByStepChecklist { get; set; }

        public SkipMode SkipMode { get; set; } = SkipMode.NotSkippable;

        [MaxLength(100)]
        public string? SkipConditionField { get; set; }

        [MaxLength(100)]
        public string SkipWhenValue { get; set; } = "false";

        public bool SkipWhenFieldMissing { get; set; } = true;

        [MaxLength(500)]
        public string? SkipReasonTemplate { get; set; }

        // ----- Execution -----

        public WorkflowStepState State { get; set; } = WorkflowStepState.NotStarted;

        public WorkflowStepAction ActionTaken { get; set; } = WorkflowStepAction.None;

        /// <summary>Assignee chosen by the manual assignment (STL -> CS, DL -> clerk...).</summary>
        public long? AssignedToUserId { get; set; }

        [MaxLength(200)]
        public string AssignedToName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string AssignedToRole { get; set; } = string.Empty;

        public long? AssignedByUserId { get; set; }
        public DateTime? AssignedAt { get; set; }

        /// <summary>Who actually executed the step. Feeds the signature block.</summary>
        public long? ActedByUserId { get; set; }

        [MaxLength(200)]
        public string ActedByName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string ActedByRole { get; set; } = string.Empty;

        public DateTime? ActedAt { get; set; }

        [MaxLength(1000)]
        public string Comments { get; set; } = string.Empty;

        /// <summary>True when the step was delegated to lower-tier staff.</summary>
        public bool WasDelegated { get; set; }

        public long? DelegatedByUserId { get; set; }

        [MaxLength(500)]
        public string DelegationReason { get; set; } = string.Empty;

        // ----- Skip result -----

        public bool IsSkipped { get; set; }

        /// <summary>True when the skip came from a form field, false when a user pressed Skip.</summary>
        public bool SkippedAutomatically { get; set; }

        [MaxLength(500)]
        public string SkipReason { get; set; } = string.Empty;

        // ----- MNT-1325 step-by-step gate -----

        public int ChecklistTotalItems { get; set; }
        public int ChecklistVerifiedItems { get; set; }

        /// <summary>
        /// JSON array of the verified checklist items
        /// ({ code, title, verified, verifiedAt, verifiedBy, finding }).
        /// </summary>
        public string ChecklistItemsJson { get; set; } = "[]";

        // ----- Signature captured on this step -----

        [MaxLength(200)]
        public string SignatureName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string SignatureRole { get; set; } = string.Empty;

        public DateTime? SignatureDate { get; set; }

        [MaxLength(128)]
        public string SignatureHash { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public FormWorkflowInstance Instance { get; set; } = null!;
    }

    // =====================================================================================
    // 3. FormSignature  -> table FormSignatures
    //    Requirement #3 / #13: "the signature block persisted on every form".
    // =====================================================================================

    /// <summary>
    /// One line of the printed signature block ("Prepared by / Reviewed by / Approved by"
    /// + date), derived from the executed step and then FROZEN, so re-printing the PDF
    /// years later reproduces the original document.
    /// </summary>
    public class FormSignature
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

public Guid? UserSignatureId { get; set; }
public string? SignatureStoragePath { get; set; }
public bool SignatureImageApplied { get; set; }
public string? SignatureFileName { get; set; }
public string? SignatureContentType { get; set; }
public string? SignatureFileSha256 { get; set; }

        /// <summary>Convenience denormalisation for the report query.</summary>
        public Guid? FormSubmissionId { get; set; }

        public Guid? EvaluationFolderId { get; set; }

        public SignatureBlockType Block { get; set; }

        /// <summary>Printed caption, e.g. "Approved by". From FormWorkflowCatalog.SignatureCaption.</summary>
        [MaxLength(50)]
        public string BlockCaption { get; set; } = string.Empty;

        /// <summary>Step that produced the signature.</summary>
        public int StepNo { get; set; }

        public long? UserId { get; set; }

        [MaxLength(200)]
        public string PersonName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value at signing time.</summary>
        [MaxLength(50)]
        public string PersonRole { get; set; } = string.Empty;

        /// <summary>Printed role label, e.g. "Shop Team Leader".</summary>
        [MaxLength(100)]
        public string PersonRoleLabel { get; set; } = string.Empty;

        public DateTime SignedAt { get; set; } = DateTime.UtcNow;

        /// <summary>SHA-256 of instanceId|stepNo|userId|signedAt. Tamper evidence.</summary>
        [MaxLength(128)]
        public string SignatureHash { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Remarks { get; set; } = string.Empty;

        public FormWorkflowInstance Instance { get; set; } = null!;
    }

    // =====================================================================================
    // 4. EvaluationFolder  -> table EvaluationFolders
    //    Requirement #2 (folder per ATA / Component), #11 (completion), #12 (revision),
    //    #13 (final sign-off + lock).
    // =====================================================================================

    /// <summary>The Self-Evaluation folder of one ATA chapter / component.</summary>
    public class EvaluationFolder
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        public Guid? ShopId { get; set; }
        public Guid? DepartmentId { get; set; }

        [MaxLength(100)]
        public string FolderCode { get; set; } = string.Empty;

        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(20)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(100)]
        public string PartNumber { get; set; } = string.Empty;

        public ApprovalStatus Status { get; set; } = ApprovalStatus.Draft;

        // ----- Completion tracking (requirement #11) -----

        public int TotalItems { get; set; }
        public int ApprovedItems { get; set; }
        public int SkippedItems { get; set; }
        public int PendingItems { get; set; }
        public int ExpiredItems { get; set; }

        /// <summary>0..100, recomputed on every step transition.</summary>
        public int CompletionPercent { get; set; }

        public bool IsComplete { get; set; }
        public DateTime? CompletedAt { get; set; }
        public long? CompletedByUserId { get; set; }

        public bool IsLocked { get; set; }
        public DateTime? LockedAt { get; set; }
        public long? LockedByUserId { get; set; }

        /// <summary>Instance of the folder-level final sign-off chain (requirement #13).</summary>
        public Guid? SignOffInstanceId { get; set; }

        // ----- PDF report (requirement #11) -----

        [MaxLength(1000)]
        public string ReportStoragePath { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ReportFileName { get; set; } = string.Empty;

        public DateTime? ReportGeneratedAt { get; set; }

        // ----- Revision cycle (requirement #12) -----

        public int RevisionNumber { get; set; } = 1;

        /// <summary>Standard two-year cycle: CompletedAt + 24 months.</summary>
        public DateTime? RevisionDueDate { get; set; }

        public DateTime? LastRevisedAt { get; set; }

        /// <summary>Watched CMM revision. A change raises RevisionTrigger.CmmRevised.</summary>
        [MaxLength(100)]
        public string LinkedCmmRevision { get; set; } = string.Empty;

        /// <summary>Watched Component Maintenance Task revision.</summary>
        [MaxLength(100)]
        public string LinkedComponentTaskRevision { get; set; } = string.Empty;

        /// <summary>Watched Task Card revision.</summary>
        [MaxLength(100)]
        public string LinkedTaskCardRevision { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        public ICollection<EvaluationFolderItem> Items { get; set; } = new List<EvaluationFolderItem>();
    }

    // =====================================================================================
    // 5. EvaluationFolderItem  -> table EvaluationFolderItems
    //    ONE ROW OF THE TABLE OF CONTENTS with its live status
    //    (Draft / Pending / Approved / Skipped / Expired).
    // =====================================================================================

    /// <summary>One Table-of-Contents row of an evaluation folder.</summary>
    public class EvaluationFolderItem
    {
        public Guid Id { get; set; }

        public Guid EvaluationFolderId { get; set; }

        // ----- Placement in the printed Table Of Contents -----

        [MaxLength(100)]
        public string SectionCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string SectionTitle { get; set; } = string.Empty;

        public int SectionOrder { get; set; }
        public int ItemOrder { get; set; }

        // ----- Identity of the form -----

        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        [MaxLength(50)]
        public string FormNo { get; set; } = string.Empty;

        [MaxLength(300)]
        public string FormTitle { get; set; } = string.Empty;

        public bool IsMandatory { get; set; } = true;
        public bool IsOptionalByRegulatoryDate { get; set; }
        public bool IsGeneratedByJointApproval { get; set; }

        // ----- Live link to the running form -----

        public Guid? FormSubmissionId { get; set; }
        public Guid? FormWorkflowInstanceId { get; set; }

        public ApprovalStatus Status { get; set; } = ApprovalStatus.Draft;

        /// <summary>Bucket rendered by the UI. From ApprovalStatusInfo.StateOf(Status).</summary>
        public FormLifecycleState LifecycleState { get; set; } = FormLifecycleState.Draft;

        /// <summary>From ApprovalStatusInfo.Label(Status). Denormalised for cheap listing.</summary>
        [MaxLength(100)]
        public string StatusLabel { get; set; } = "Draft";

        public int TotalSteps { get; set; }
        public int CompletedSteps { get; set; }

        /// <summary>Pending step title, so the ToC can show "waiting on ...".</summary>
        [MaxLength(300)]
        public string CurrentStepTitle { get; set; } = string.Empty;

        public long? CurrentAssigneeUserId { get; set; }

        [MaxLength(200)]
        public string CurrentAssigneeName { get; set; } = string.Empty;

        // ----- Validity -----

        public int? ExpiryMonths { get; set; }
        public DateTime? ExpiresAt { get; set; }
        public bool IsExpired { get; set; }

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public EvaluationFolder Folder { get; set; } = null!;
    }

    // =====================================================================================
    // 6. ExpiryTracking  -> table ExpiryTrackings
    //    Requirement #10: "Track expiry dates (training verification, tool calibration,
    //    certifications), auto-notify the relevant users ... then allow role-based
    //    amendment of the task data followed by its own approval cycle."
    // =====================================================================================

    /// <summary>One tracked validity window.</summary>
    public class ExpiryTracking
    {
        public Guid Id { get; set; }

        /// <summary>"FormWorkflowInstance", "CompetencyMatrixEntry", "ToolEquivalencyMatrixEntry".</summary>
        [Required]
        [MaxLength(100)]
        public string EntityType { get; set; } = string.Empty;

        public Guid EntityId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ShopId { get; set; }

        /// <summary>FormNodeTypes value when the tracked item is a form.</summary>
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        /// <summary>Printed description, e.g. "Training verification - Inspection personnel".</summary>
        [MaxLength(300)]
        public string TrackedItem { get; set; } = string.Empty;

        public DateTime ValidFrom { get; set; }
        public DateTime ExpiresAt { get; set; }
        public int ExpiryMonths { get; set; }

        /// <summary>Days before ExpiresAt at which the first notification is raised.</summary>
        public int WarnDaysBefore { get; set; } = 30;

        public bool IsExpired { get; set; }
        public DateTime? ExpiredAt { get; set; }

        public DateTime? FirstNotifiedAt { get; set; }
        public DateTime? LastNotifiedAt { get; set; }
        public int NotificationCount { get; set; }

        /// <summary>User expected to amend the expired data (role-based editing).</summary>
        public long? ResponsibleUserId { get; set; }

        [MaxLength(50)]
        public string ResponsibleRole { get; set; } = string.Empty;

        /// <summary>Amendment cycle raised for this expiry (AmendmentCycleFormType).</summary>
        public Guid? AmendmentInstanceId { get; set; }

        /// <summary>Draft / PendingAmendmentApproval / Approved / Expired.</summary>
        public ApprovalStatus Status { get; set; } = ApprovalStatus.Approved;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 7. WorkflowNotification  -> table WorkflowNotifications
    //    Requirement #10: in-app notification centre.
    // =====================================================================================

    /// <summary>One in-app notification for one recipient.</summary>
    public class WorkflowNotification
    {
        public Guid Id { get; set; }

        public long RecipientUserId { get; set; }

        [MaxLength(50)]
        public string RecipientRole { get; set; } = string.Empty;

        public Guid? ShopId { get; set; }

        /// <summary>NotificationCategories value.</summary>
        [Required]
        [MaxLength(50)]
        public string Category { get; set; } = string.Empty;

        [Required]
        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string Message { get; set; } = string.Empty;

        [MaxLength(100)]
        public string EntityType { get; set; } = string.Empty;

        public Guid EntityId { get; set; }

        public Guid? FormWorkflowInstanceId { get; set; }
        public Guid? EvaluationFolderId { get; set; }

        /// <summary>Deep link the UI opens, e.g. "/folders/{id}/forms/{formType}".</summary>
        [MaxLength(500)]
        public string ActionUrl { get; set; } = string.Empty;

        public bool IsRead { get; set; }
        public DateTime? ReadAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 8. CompetencyMatrixEntry  -> table CompetencyMatrixEntries
    //    Requirement #12: "monitoring of individual competencies (training completion dates)".
    // =====================================================================================

    /// <summary>One employee / one training requirement of the competency matrix.</summary>
    public class CompetencyMatrixEntry
    {
        public Guid Id { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ShopId { get; set; }

        public long EmployeeUserId { get; set; }

        [MaxLength(200)]
        public string EmployeeName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string EmployeeNo { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value of the employee.</summary>
        [MaxLength(50)]
        public string EmployeeRole { get; set; } = string.Empty;

        [MaxLength(100)]
        public string TrainingCode { get; set; } = string.Empty;

        [MaxLength(300)]
        public string TrainingTitle { get; set; } = string.Empty;

        /// <summary>FormNodeTypes value of the training form that produced the entry.</summary>
        [MaxLength(100)]
        public string SourceFormType { get; set; } = string.Empty;

        public Guid? SourceFormSubmissionId { get; set; }

        public DateTime? TrainingCompletedDate { get; set; }
        public DateTime? TrainingExpiryDate { get; set; }

        public ProficiencyLevel Level { get; set; } = ProficiencyLevel.NotRated;

        /// <summary>Result of the HR filter ("HR filters eligible employees").</summary>
        public bool IsEligible { get; set; }

        public bool IsExpired { get; set; }

        public long? VerifiedByUserId { get; set; }

        [MaxLength(50)]
        public string VerifiedByRole { get; set; } = string.Empty;

        public DateTime? VerifiedAt { get; set; }

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 9. ToolEquivalencyMatrixEntry  -> table ToolEquivalencyMatrixEntries
    //    Requirement #12: "the tool equivalency matrix"; also the source of the tool
    //    calibration expiry rows of requirement #10.
    // =====================================================================================

    /// <summary>One original tool / alternate tool equivalency pair.</summary>
    public class ToolEquivalencyMatrixEntry
    {
        public Guid Id { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ShopId { get; set; }

        [MaxLength(200)]
        public string OriginalToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string OriginalToolDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AlternateToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AlternateToolDescription { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string EquivalencyBasis { get; set; } = string.Empty;

        /// <summary>True when the alternate tool is manufactured in-house (MNT-1229D/E/F).</summary>
        public bool IsInhouseManufactured { get; set; }

        public bool EquivalencyApproved { get; set; }

        /// <summary>Special Team Leader who approved the alternate-tool pathway.</summary>
        public long? ApprovedByUserId { get; set; }

        [MaxLength(50)]
        public string ApprovedByRole { get; set; } = string.Empty;

        public DateTime? ApprovedAt { get; set; }

        public ToolStatus Status { get; set; } = ToolStatus.Required;

        [MaxLength(100)]
        public string CalibrationInterval { get; set; } = string.Empty;

        public DateTime? LastCalibrationDate { get; set; }
        public DateTime? CalibrationDueDate { get; set; }

        /// <summary>MNT-1229B / MNT-1229C / MNT-1229D submission that produced the row.</summary>
        [MaxLength(100)]
        public string SourceFormType { get; set; } = string.Empty;

        public Guid? SourceFormSubmissionId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    // =====================================================================================
    // 10. FolderRevisionLog  -> table FolderRevisionLogs
    //     Requirement #12: two-year cycle + documentation-triggered revisions.
    // =====================================================================================

    /// <summary>One raised revision of an evaluation folder.</summary>
    public class FolderRevisionLog
    {
        public Guid Id { get; set; }

        public Guid EvaluationFolderId { get; set; }

        /// <summary>Revision number the folder moves TO.</summary>
        public int RevisionNumber { get; set; }

        public RevisionTrigger Trigger { get; set; }

        /// <summary>CMM document number / task card code that caused the trigger.</summary>
        [MaxLength(300)]
        public string TriggerReference { get; set; } = string.Empty;

        [MaxLength(100)]
        public string PreviousRevision { get; set; } = string.Empty;

        [MaxLength(100)]
        public string NewRevision { get; set; } = string.Empty;

        /// <summary>The RevisionCycleFormType instance that carries the approval chain.</summary>
        public Guid? RevisionInstanceId { get; set; }

        public ApprovalStatus Status { get; set; } = ApprovalStatus.Draft;

        public DateTime RaisedAt { get; set; } = DateTime.UtcNow;
        public DateTime? ClosedAt { get; set; }

        public long? RaisedByUserId { get; set; }
        public long? ClosedByUserId { get; set; }

        [MaxLength(1000)]
        public string Notes { get; set; } = string.Empty;
    }
}