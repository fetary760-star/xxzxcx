using System;
using System.Collections.Generic;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.Contracts.Workflow
{
    // =====================================================================================
    // AMENDED v9 - WorkflowApiContracts.cs   (NEW FILE)
    // Copy to: CMT.Application.SelfEvaluation/Contracts/Workflow/WorkflowApiContracts.cs
    //
    // WHAT THIS FILE IS
    // -----------------
    // The REQUEST / RESPONSE shapes of every workflow endpoint of the amendment. They are
    // deliberately kept in CMT.Application.SelfEvaluation (not CMT.Domain) because they are transport
    // objects: the controllers bind to them, the engine returns them, the frontend mirrors
    // them.
    //
    // TWO BINDING RULES LEARNED FROM v4 AND APPLIED EVERYWHERE HERE
    //   (1) every user id is long, NEVER Guid. Sending a numeric id into a Guid property is
    //       exactly what produced the 400 application/problem+json responses on the user
    //       endpoints. Entity ids (folder / instance / submission) stay Guid.
    //   (2) every enum is ALSO exposed as a string label, so the frontend never re-implements
    //       ApprovalStatusInfo.Label / RoleHierarchy.Label switch statements.
    //
    // ENDPOINT MAP (full contracts, verbs and status codes are in
    // docs/AMENDMENT_v9_CONTRACTS.md)
    //
    //   FOLDER + TABLE OF CONTENTS
    //     POST   /api/evaluation-folders                        CreateFolderRequest        -> FolderDetailResponse
    //     GET    /api/evaluation-folders                         (query)                    -> FolderSummaryResponse[]
    //     GET    /api/evaluation-folders/{folderId}                                         -> FolderDetailResponse
    //     GET    /api/evaluation-folders/{folderId}/table-of-contents                       -> TableOfContentsResponse
    //     GET    /api/evaluation-folders/{folderId}/progress                                -> FolderProgressResponse
    //     POST   /api/evaluation-folders/{folderId}/sign-off                                -> WorkflowActionResponse
    //     POST   /api/evaluation-folders/{folderId}/report                                  -> FolderReportResponse
    //     GET    /api/evaluation-folders/{folderId}/report                                  -> file (application/pdf)
    //
    //   FORM LIFECYCLE
    //     POST   /api/workflow/forms                             CreateFormDraftRequest     -> WorkflowInstanceResponse
    //     GET    /api/workflow/forms/{instanceId}                                           -> WorkflowInstanceResponse
    //     POST   /api/workflow/forms/{instanceId}/submit          SubmitFormRequest          -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/assign           AssignStepRequest          -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/delegate         DelegateStepRequest        -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/approve          DecisionRequest            -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/reject           DecisionRequest            -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/return           DecisionRequest            -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/skip             SkipStepRequest            -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/checklist        ChecklistVerifyRequest     -> WorkflowActionResponse
    //     POST   /api/workflow/forms/{instanceId}/joint-approval   EnableJointApprovalRequest -> WorkflowActionResponse
    //     GET    /api/workflow/inbox                               (query)                    -> InboxItemResponse[]
    //     GET    /api/workflow/catalog                                                       -> CatalogFormResponse[]
    //     GET    /api/workflow/catalog/{formType}                                            -> CatalogFormResponse
    //     GET    /api/workflow/permissions/me                                                -> MyPermissionsResponse
    //
    //   EXPIRY / AMENDMENT / REVISION / MATRICES
    //     GET    /api/workflow/expiries                            (query)                   -> ExpiryItemResponse[]
    //     POST   /api/workflow/expiries/{expiryId}/amend            StartAmendmentRequest     -> WorkflowInstanceResponse
    //     GET    /api/workflow/notifications                        (query)                   -> NotificationResponse[]
    //     POST   /api/workflow/notifications/{id}/read                                        -> 204
    //     POST   /api/evaluation-folders/{folderId}/revisions       RaiseRevisionRequest      -> RevisionResponse
    //     GET    /api/evaluation-folders/{folderId}/revisions                                 -> RevisionResponse[]
    //     GET    /api/evaluation-folders/{folderId}/competency-matrix                         -> CompetencyMatrixRowResponse[]
    //     PUT    /api/evaluation-folders/{folderId}/competency-matrix UpsertCompetencyRequest -> CompetencyMatrixRowResponse
    //     GET    /api/evaluation-folders/{folderId}/tool-equivalency                          -> ToolEquivalencyRowResponse[]
    //     PUT    /api/evaluation-folders/{folderId}/tool-equivalency  UpsertToolEquivalencyRequest -> ToolEquivalencyRowResponse
    // =====================================================================================

    // =====================================================================================
    // REQUESTS
    // =====================================================================================

    /// <summary>POST /api/evaluation-folders</summary>
    public sealed class CreateFolderRequest
    {
        /// <summary>ATA / Component record that owns the folder.</summary>
        public Guid ATARecordId { get; set; }

        /// <summary>Optional override; defaults to the ATA record shop.</summary>
        public Guid? ShopId { get; set; }

        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// Regulatory target date driving the "Optional / May Skip Now" flag of 918 / 918A.
        /// Null = no date set yet, so those forms stay skippable.
        /// </summary>
        public DateTime? RegulatoryTargetDate { get; set; }

        /// <summary>Seed the joint approval path DIR -> QA -> ECAA immediately.</summary>
        public bool EnableJointApprovalPath { get; set; }

        /// <summary>Revision watch values: a change later raises a revision cycle.</summary>
        public string LinkedCmmRevision { get; set; } = string.Empty;
        public string LinkedComponentTaskRevision { get; set; } = string.Empty;
        public string LinkedTaskCardRevision { get; set; } = string.Empty;
    }

    /// <summary>POST /api/workflow/forms</summary>
    public sealed class CreateFormDraftRequest
    {
        /// <summary>FormNodeTypes value or a catalog virtual form type.</summary>
        public string FormType { get; set; } = string.Empty;

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }

        /// <summary>Raw form payload; also the source of the skip-condition fields.</summary>
        public string FormDataJson { get; set; } = "{}";

        /// <summary>
        /// MNT-1420A only: must be "others" ("Triggered under the Others category").
        /// </summary>
        public string? InitiationCategory { get; set; }

        public DateTime? RegulatoryTargetDate { get; set; }
    }

    /// <summary>POST /api/workflow/forms/{instanceId}/submit</summary>
    public sealed class SubmitFormRequest
    {
        /// <summary>Updated payload saved before the chain starts. Optional.</summary>
        public string? FormDataJson { get; set; }

        /// <summary>
        /// Optional pre-assignment of the first step, so the STL can draft and assign the
        /// Certifying Staff in one call.
        /// </summary>
        public long? AssignToUserId { get; set; }

        public string Comments { get; set; } = string.Empty;
    }

    /// <summary>POST /api/workflow/forms/{instanceId}/assign</summary>
    public sealed class AssignStepRequest
    {
        /// <summary>Step to assign. Null = the currently pending step.</summary>
        public int? StepNo { get; set; }

        /// <summary>Chosen assignee. long, never Guid.</summary>
        public long AssignToUserId { get; set; }

        public string Comments { get; set; } = string.Empty;
    }

    /// <summary>POST /api/workflow/forms/{instanceId}/delegate</summary>
    public sealed class DelegateStepRequest
    {
        public int? StepNo { get; set; }

        /// <summary>Lower-tier delegate. Must be strictly LESS senior than the actor.</summary>
        public long DelegateToUserId { get; set; }

        /// <summary>Mandatory: "workload is high" justification.</summary>
        public string Reason { get; set; } = string.Empty;
    }

    /// <summary>POST approve / reject / return.</summary>
    public sealed class DecisionRequest
    {
        public int? StepNo { get; set; }

        /// <summary>Mandatory when the step declares RequiresComments, or on reject / return.</summary>
        public string Comments { get; set; } = string.Empty;

        /// <summary>Return target. Null = the immediately previous step.</summary>
        public int? ReturnToStepNo { get; set; }

        /// <summary>Payload corrections saved together with the decision. Optional.</summary>
        public string? FormDataJson { get; set; }
    }

    /// <summary>POST /api/workflow/forms/{instanceId}/skip</summary>
    public sealed class SkipStepRequest
    {
        public int? StepNo { get; set; }

        /// <summary>Mandatory audit reason of the manual skip.</summary>
        public string Reason { get; set; } = string.Empty;
    }

    /// <summary>
    /// POST /api/workflow/forms/{instanceId}/checklist - MNT-1325 step-by-step gate.
    /// One call per checklist item: "each required page, tool equivalency and facility
    /// metric is verified step-by-step".
    /// </summary>
    public sealed class ChecklistVerifyRequest
    {
        public int? StepNo { get; set; }

        /// <summary>Checklist item code, e.g. "PAGE-07", "TOOL-EQ-03", "FAC-TEMP".</summary>
        public string ItemCode { get; set; } = string.Empty;

        public bool Verified { get; set; }

        /// <summary>Mandatory when Verified is false.</summary>
        public string Finding { get; set; } = string.Empty;
    }

    /// <summary>POST /api/workflow/forms/{instanceId}/joint-approval</summary>
    public sealed class EnableJointApprovalRequest
    {
        public bool Enable { get; set; } = true;

        /// <summary>Drives the "Optional / May Skip Now" evaluation.</summary>
        public DateTime? RegulatoryTargetDate { get; set; }

        /// <summary>Generate the companion form (918 FAA -> 918A CAA) immediately.</summary>
        public bool GenerateCompanionForm { get; set; } = true;
    }

    /// <summary>POST /api/workflow/expiries/{expiryId}/amend</summary>
    public sealed class StartAmendmentRequest
    {
        /// <summary>Amended task data.</summary>
        public string FormDataJson { get; set; } = "{}";

        public string Reason { get; set; } = string.Empty;

        /// <summary>New validity start date; defaults to now.</summary>
        public DateTime? NewValidFrom { get; set; }
    }

    /// <summary>POST /api/evaluation-folders/{folderId}/revisions</summary>
    public sealed class RaiseRevisionRequest
    {
        public RevisionTrigger Trigger { get; set; } = RevisionTrigger.Manual;

        /// <summary>CMM number / task card code that caused the trigger.</summary>
        public string TriggerReference { get; set; } = string.Empty;

        public string NewRevision { get; set; } = string.Empty;

        public string Notes { get; set; } = string.Empty;
    }

    /// <summary>PUT /api/evaluation-folders/{folderId}/competency-matrix</summary>
    public sealed class UpsertCompetencyRequest
    {
        public long EmployeeUserId { get; set; }
        public string TrainingCode { get; set; } = string.Empty;
        public string TrainingTitle { get; set; } = string.Empty;
        public DateTime? TrainingCompletedDate { get; set; }
        public ProficiencyLevel Level { get; set; } = ProficiencyLevel.NotRated;
        public bool IsEligible { get; set; }
        public string Remarks { get; set; } = string.Empty;
    }

    /// <summary>PUT /api/evaluation-folders/{folderId}/tool-equivalency</summary>
    public sealed class UpsertToolEquivalencyRequest
    {
        public Guid? Id { get; set; }
        public string OriginalToolPartNumber { get; set; } = string.Empty;
        public string OriginalToolDescription { get; set; } = string.Empty;
        public string AlternateToolPartNumber { get; set; } = string.Empty;
        public string AlternateToolDescription { get; set; } = string.Empty;
        public string EquivalencyBasis { get; set; } = string.Empty;
        public bool IsInhouseManufactured { get; set; }
        public string CalibrationInterval { get; set; } = string.Empty;
        public DateTime? LastCalibrationDate { get; set; }
    }

    // =====================================================================================
    // RESPONSES
    // =====================================================================================

    /// <summary>Uniform result of every workflow transition.</summary>
    public sealed class WorkflowActionResponse
    {
        public bool Success { get; set; }

        /// <summary>Human readable outcome, safe to toast in the UI.</summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>Machine readable failure code, e.g. "ROLE_NOT_ELIGIBLE".</summary>
        public string? ErrorCode { get; set; }

        public Guid InstanceId { get; set; }

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;
        public FormLifecycleState LifecycleState { get; set; }

        public int CurrentStepNo { get; set; }
        public string CurrentStepTitle { get; set; } = string.Empty;

        public long? CurrentAssigneeUserId { get; set; }
        public string CurrentAssigneeName { get; set; } = string.Empty;

        /// <summary>Steps auto-skipped by this transition, for the "N steps skipped" toast.</summary>
        public List<int> AutoSkippedSteps { get; set; } = new();

        public bool IsComplete { get; set; }
        public bool IsLocked { get; set; }

        /// <summary>The folder was marked Complete by this transition (requirement #11).</summary>
        public bool FolderCompleted { get; set; }

        /// <summary>The consolidated PDF report was generated by this transition.</summary>
        public bool ReportGenerated { get; set; }

        /// <summary>Companion instance created by the joint approval path (918A CAA).</summary>
        public Guid? CompanionInstanceId { get; set; }
    }

    /// <summary>One materialised step, as rendered by the form timeline.</summary>
    public sealed class WorkflowStepResponse
    {
        public Guid Id { get; set; }
        public int StepNo { get; set; }
        public string Title { get; set; } = string.Empty;

        public WorkflowStepKind Kind { get; set; }
        public string KindLabel { get; set; } = string.Empty;

        public WorkflowStepState State { get; set; }
        public string StateLabel { get; set; } = string.Empty;

        public ApprovalStatus PendingStatus { get; set; }
        public string PendingStatusLabel { get; set; } = string.Empty;

        public WorkflowStepAction ActionTaken { get; set; }

        public SignatureBlockType SignatureBlock { get; set; }

        /// <summary>"Prepared by" / "Reviewed by" / "Approved by" ...</summary>
        public string SignatureCaption { get; set; } = string.Empty;

        /// <summary>Canonical roles allowed to act.</summary>
        public List<string> EligibleRoles { get; set; } = new();

        /// <summary>Printed role labels, e.g. "Shop Team Leader".</summary>
        public List<string> EligibleRoleLabels { get; set; } = new();

        public bool RequiresManualAssignment { get; set; }
        public List<string> AssignerRoles { get; set; } = new();
        public string? AssignmentUnit { get; set; }

        public bool RestrictToOriginatorShop { get; set; }
        public bool AllowsDelegation { get; set; }
        public bool RequiresComments { get; set; }
        public bool IsStepByStepChecklist { get; set; }

        public SkipMode SkipMode { get; set; }
        public string? SkipConditionField { get; set; }
        public bool IsSkipped { get; set; }
        public bool SkippedAutomatically { get; set; }
        public string SkipReason { get; set; } = string.Empty;

        public long? AssignedToUserId { get; set; }
        public string AssignedToName { get; set; } = string.Empty;
        public string AssignedToRole { get; set; } = string.Empty;
        public DateTime? AssignedAt { get; set; }

        public long? ActedByUserId { get; set; }
        public string ActedByName { get; set; } = string.Empty;
        public string ActedByRole { get; set; } = string.Empty;
        public DateTime? ActedAt { get; set; }

        public string Comments { get; set; } = string.Empty;

        public bool WasDelegated { get; set; }
        public string DelegationReason { get; set; } = string.Empty;

        public int ChecklistTotalItems { get; set; }
        public int ChecklistVerifiedItems { get; set; }

        // ----- Capability flags computed for the CALLING user, so the UI needs no rules -----
        public bool CanIAct { get; set; }
        public bool CanIAssign { get; set; }
        public bool CanIDelegate { get; set; }
        public bool CanISkip { get; set; }
    }

    /// <summary>One line of the printed signature block.</summary>
    public sealed class FormSignatureResponse
    {
        public SignatureBlockType Block { get; set; }
        public string Caption { get; set; } = string.Empty;
        public int StepNo { get; set; }
        public long? UserId { get; set; }
        public string PersonName { get; set; } = string.Empty;
        public string PersonRole { get; set; } = string.Empty;
        public string PersonRoleLabel { get; set; } = string.Empty;
        public DateTime SignedAt { get; set; }
        public string SignatureHash { get; set; } = string.Empty;
    }

    /// <summary>Full view of one running form.</summary>
    public sealed class WorkflowInstanceResponse
    {
        public Guid Id { get; set; }
        public Guid? FormSubmissionId { get; set; }
        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }

        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string SectionTitle { get; set; } = string.Empty;

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;
        public FormLifecycleState LifecycleState { get; set; }

        public int CurrentStepNo { get; set; }
        public long? CurrentAssigneeUserId { get; set; }
        public string CurrentAssigneeName { get; set; } = string.Empty;
        public string? CurrentAssignmentUnit { get; set; }

        public long OriginatorUserId { get; set; }
        public string OriginatorName { get; set; } = string.Empty;
        public string OriginatorRole { get; set; } = string.Empty;

        public DateTime? SubmittedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public DateTime? ExpiresAt { get; set; }

        public bool IsComplete { get; set; }
        public bool IsLocked { get; set; }

        public bool IsOptionalByRegulatoryDate { get; set; }
        public DateTime? RegulatoryTargetDate { get; set; }
        public bool MaySkipNow { get; set; }
        public bool JointApprovalEnabled { get; set; }
        public Guid? JointApprovalCompanionInstanceId { get; set; }

        public int RevisionNumber { get; set; }

        public int TotalSteps { get; set; }
        public int CompletedSteps { get; set; }
        public int ProgressPercent { get; set; }

        public string FormDataJson { get; set; } = "{}";

        public List<WorkflowStepResponse> Steps { get; set; } = new();
        public List<FormSignatureResponse> Signatures { get; set; } = new();
    }

    /// <summary>One Table-of-Contents row with live status.</summary>
    public sealed class TableOfContentsItemResponse
    {
        public Guid Id { get; set; }

        public string SectionCode { get; set; } = string.Empty;
        public string SectionTitle { get; set; } = string.Empty;
        public int SectionOrder { get; set; }
        public int ItemOrder { get; set; }

        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string FormTitle { get; set; } = string.Empty;

        public bool IsMandatory { get; set; }
        public bool IsOptionalByRegulatoryDate { get; set; }
        public bool MaySkipNow { get; set; }

        public Guid? FormSubmissionId { get; set; }
        public Guid? FormWorkflowInstanceId { get; set; }

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        /// <summary>Draft / Pending / Approved / Skipped / Expired / ActionRequired.</summary>
        public FormLifecycleState LifecycleState { get; set; }
        public string LifecycleStateLabel { get; set; } = string.Empty;

        public int TotalSteps { get; set; }
        public int CompletedSteps { get; set; }

        public string CurrentStepTitle { get; set; } = string.Empty;
        public long? CurrentAssigneeUserId { get; set; }
        public string CurrentAssigneeName { get; set; } = string.Empty;

        public DateTime? ExpiresAt { get; set; }
        public bool IsExpired { get; set; }

        public string Remarks { get; set; } = string.Empty;
        public string RoutingLabel { get; set; } = string.Empty;
        public bool RoutingReadOnly { get; set; }

        /// <summary>The calling user may draft this form (drives the "Start" button).</summary>
        public bool CanIDraft { get; set; }

        /// <summary>The calling user owns the pending step.</summary>
        public bool CanIAct { get; set; }
        public bool ApprovalGateOpen { get; set; }
        public string ApprovalGateMessage { get; set; } = string.Empty;
    }

    /// <summary>One printed section of the Table Of Contents.</summary>
    public sealed class TableOfContentsSectionResponse
    {
        public string Code { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public int Order { get; set; }

        public int TotalItems { get; set; }
        public int ApprovedItems { get; set; }
        public int PendingItems { get; set; }
        public int SkippedItems { get; set; }
        public int ExpiredItems { get; set; }

        public List<TableOfContentsItemResponse> Items { get; set; } = new();
    }

    /// <summary>GET /api/evaluation-folders/{folderId}/table-of-contents</summary>
    public sealed class TableOfContentsResponse
    {
        public Guid FolderId { get; set; }
        public string FolderCode { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        public int CompletionPercent { get; set; }

        public List<TableOfContentsSectionResponse> Sections { get; set; } = new();
    }

    /// <summary>GET /api/evaluation-folders/{folderId}/progress</summary>
    public sealed class FolderProgressResponse
    {
        public Guid FolderId { get; set; }

        public int TotalItems { get; set; }
        public int ApprovedItems { get; set; }
        public int SkippedItems { get; set; }
        public int PendingItems { get; set; }
        public int ExpiredItems { get; set; }
        public int CompletionPercent { get; set; }

        public bool IsComplete { get; set; }
        public bool IsLocked { get; set; }

        /// <summary>Mandatory forms still blocking completion.</summary>
        public List<TableOfContentsItemResponse> RemainingItems { get; set; } = new();

        public bool ReportAvailable { get; set; }
        public DateTime? ReportGeneratedAt { get; set; }
    }

    public sealed class FolderSummaryResponse
    {
        public Guid Id { get; set; }
        public Guid ATARecordId { get; set; }
        public Guid? ShopId { get; set; }
        public string FolderCode { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        public int CompletionPercent { get; set; }
        public int PendingItems { get; set; }
        public int ExpiredItems { get; set; }

        public bool IsComplete { get; set; }
        public bool IsLocked { get; set; }

        public int RevisionNumber { get; set; }
        public DateTime? RevisionDueDate { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public sealed class FolderDetailResponse
    {
        public FolderSummaryResponse Folder { get; set; } = new();
        public TableOfContentsResponse TableOfContents { get; set; } = new();
        public FolderProgressResponse Progress { get; set; } = new();

        /// <summary>The folder-level final sign-off chain, when it has been raised.</summary>
        public WorkflowInstanceResponse? SignOff { get; set; }
    }

    /// <summary>POST /api/evaluation-folders/{folderId}/report</summary>
    public sealed class FolderReportResponse
    {
        public Guid FolderId { get; set; }
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;

        /// <summary>Download URL served by the API; never a raw local path.</summary>
        public string DownloadUrl { get; set; } = string.Empty;

        public DateTime GeneratedAt { get; set; }
        public int IncludedForms { get; set; }
        public int IncludedSignatures { get; set; }
    }

    /// <summary>GET /api/workflow/inbox - "Pending my action".</summary>
    public sealed class InboxItemResponse
    {
        public Guid InstanceId { get; set; }
        public Guid? FormSubmissionId { get; set; }
        public Guid? EvaluationFolderId { get; set; }

        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string SectionTitle { get; set; } = string.Empty;

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        public int StepNo { get; set; }
        public string StepTitle { get; set; } = string.Empty;
        public WorkflowStepKind StepKind { get; set; }

        /// <summary>True when the row is in the caller's TEAM queue, not personally assigned.</summary>
        public bool IsUnitQueue { get; set; }
        public string? AssignmentUnit { get; set; }

        public bool NeedsAssignment { get; set; }
        public bool CanIAct { get; set; }
        public bool CanIAssign { get; set; }
        public bool CanISkip { get; set; }

        public string OriginatorName { get; set; } = string.Empty;
        public DateTime? SubmittedAt { get; set; }
        public DateTime? DueDate { get; set; }
        public bool IsOverdue { get; set; }
    }

    /// <summary>GET /api/workflow/catalog - routing reference, no database access.</summary>
    public sealed class CatalogStepResponse
    {
        public int StepNo { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
        public List<string> EligibleRoles { get; set; } = new();
        public List<string> EligibleRoleLabels { get; set; } = new();
        public string SignatureCaption { get; set; } = string.Empty;
        public bool RequiresManualAssignment { get; set; }
        public List<string> AssignerRoles { get; set; } = new();
        public string? AssignmentUnit { get; set; }
        public string SkipMode { get; set; } = string.Empty;
        public string? SkipConditionField { get; set; }
        public bool RestrictToOriginatorShop { get; set; }
        public bool AllowsDelegation { get; set; }
    }

    public sealed class CatalogFormResponse
    {
        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string SectionTitle { get; set; } = string.Empty;
        public int Order { get; set; }

        public List<string> DraftRoles { get; set; } = new();
        public List<string> DraftRoleLabels { get; set; } = new();

        public bool IncludeInFolder { get; set; }
        public bool IsMandatory { get; set; }
        public bool IsOptionalByRegulatoryDate { get; set; }
        public bool IsGeneratedByJointApproval { get; set; }
        public string? JointApprovalCompanionFormType { get; set; }
        public int? ExpiryMonths { get; set; }
        public bool IsFinalReleaseGate { get; set; }
        public bool BypassesLowerTiers { get; set; }
        public string Remarks { get; set; } = string.Empty;

        /// <summary>The calling user may create this draft.</summary>
        public bool CanIDraft { get; set; }

        public List<CatalogStepResponse> Steps { get; set; } = new();
    }

    /// <summary>GET /api/workflow/permissions/me - the whole client-side gate in one call.</summary>
    public sealed class MyPermissionsResponse
    {
        public long UserId { get; set; }
        public string Role { get; set; } = string.Empty;
        public string RoleLabel { get; set; } = string.Empty;
        public Guid? ShopId { get; set; }
        public Guid? DepartmentId { get; set; }
        public string? FunctionalUnit { get; set; }
        public bool LeadsFunctionalUnit { get; set; }

        /// <summary>(defaults + AdditionalPermissions) - RevokedPermissions.</summary>
        public List<string> Permissions { get; set; } = new();

        public List<string> CreatableRoles { get; set; } = new();
        public List<string> DraftableFormTypes { get; set; } = new();

        public bool CanSkipSteps { get; set; }
        public bool CanDelegate { get; set; }
        public bool CanGrantPrivileges { get; set; }
    }

    /// <summary>GET /api/workflow/expiries</summary>
    public sealed class ExpiryItemResponse
    {
        public Guid Id { get; set; }
        public string EntityType { get; set; } = string.Empty;
        public Guid EntityId { get; set; }
        public Guid? EvaluationFolderId { get; set; }

        public string FormType { get; set; } = string.Empty;
        public string TrackedItem { get; set; } = string.Empty;

        public DateTime ValidFrom { get; set; }
        public DateTime ExpiresAt { get; set; }
        public int DaysRemaining { get; set; }
        public bool IsExpired { get; set; }
        public bool IsInWarningWindow { get; set; }

        public long? ResponsibleUserId { get; set; }
        public string ResponsibleRole { get; set; } = string.Empty;

        public Guid? AmendmentInstanceId { get; set; }

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        /// <summary>The calling user may start the amendment cycle.</summary>
        public bool CanIAmend { get; set; }
    }

    /// <summary>GET /api/workflow/notifications</summary>
    public sealed class NotificationResponse
    {
        public Guid Id { get; set; }
        public string Category { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string EntityType { get; set; } = string.Empty;
        public Guid EntityId { get; set; }
        public Guid? FormWorkflowInstanceId { get; set; }
        public Guid? EvaluationFolderId { get; set; }
        public string ActionUrl { get; set; } = string.Empty;
        public bool IsRead { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>Revision cycle row (requirement #12).</summary>
    public sealed class RevisionResponse
    {
        public Guid Id { get; set; }
        public Guid EvaluationFolderId { get; set; }
        public int RevisionNumber { get; set; }

        public RevisionTrigger Trigger { get; set; }
        public string TriggerLabel { get; set; } = string.Empty;
        public string TriggerReference { get; set; } = string.Empty;

        public string PreviousRevision { get; set; } = string.Empty;
        public string NewRevision { get; set; } = string.Empty;

        public Guid? RevisionInstanceId { get; set; }

        public ApprovalStatus Status { get; set; }
        public string StatusLabel { get; set; } = string.Empty;

        public DateTime RaisedAt { get; set; }
        public DateTime? ClosedAt { get; set; }
        public string Notes { get; set; } = string.Empty;
    }

    public sealed class CompetencyMatrixRowResponse
    {
        public Guid Id { get; set; }
        public long EmployeeUserId { get; set; }
        public string EmployeeName { get; set; } = string.Empty;
        public string EmployeeNo { get; set; } = string.Empty;
        public string EmployeeRole { get; set; } = string.Empty;
        public string EmployeeRoleLabel { get; set; } = string.Empty;

        public string TrainingCode { get; set; } = string.Empty;
        public string TrainingTitle { get; set; } = string.Empty;
        public string SourceFormType { get; set; } = string.Empty;

        public DateTime? TrainingCompletedDate { get; set; }
        public DateTime? TrainingExpiryDate { get; set; }
        public int? DaysRemaining { get; set; }

        public ProficiencyLevel Level { get; set; }
        public bool IsEligible { get; set; }
        public bool IsExpired { get; set; }

        public string VerifiedByRole { get; set; } = string.Empty;
        public DateTime? VerifiedAt { get; set; }
        public string Remarks { get; set; } = string.Empty;
    }

    public sealed class ToolEquivalencyRowResponse
    {
        public Guid Id { get; set; }
        public string OriginalToolPartNumber { get; set; } = string.Empty;
        public string OriginalToolDescription { get; set; } = string.Empty;
        public string AlternateToolPartNumber { get; set; } = string.Empty;
        public string AlternateToolDescription { get; set; } = string.Empty;
        public string EquivalencyBasis { get; set; } = string.Empty;

        public bool IsInhouseManufactured { get; set; }
        public bool EquivalencyApproved { get; set; }
        public string ApprovedByRole { get; set; } = string.Empty;
        public DateTime? ApprovedAt { get; set; }

        public ToolStatus Status { get; set; }
        public string CalibrationInterval { get; set; } = string.Empty;
        public DateTime? LastCalibrationDate { get; set; }
        public DateTime? CalibrationDueDate { get; set; }
        public bool CalibrationOverdue { get; set; }

        public string SourceFormType { get; set; } = string.Empty;
    }

    /// <summary>Machine readable failure codes returned in WorkflowActionResponse.ErrorCode.</summary>
    public static class WorkflowErrorCodes
    {
        public const string FormNotCatalogued = "FORM_NOT_CATALOGUED";
        public const string InstanceNotFound = "INSTANCE_NOT_FOUND";
        public const string FolderNotFound = "FOLDER_NOT_FOUND";
        public const string FolderLocked = "FOLDER_LOCKED";
        public const string NotDraftRole = "NOT_DRAFT_ROLE";
        public const string RoleNotEligible = "ROLE_NOT_ELIGIBLE";
        public const string NotAssignee = "NOT_ASSIGNEE";
        public const string StepNotActive = "STEP_NOT_ACTIVE";
        public const string AssignmentRequired = "ASSIGNMENT_REQUIRED";
        public const string AssigneeInvalidRole = "ASSIGNEE_INVALID_ROLE";
        public const string AssigneeOutsideShop = "ASSIGNEE_OUTSIDE_SHOP";
        public const string DelegateNotLowerTier = "DELEGATE_NOT_LOWER_TIER";
        public const string DelegationNotAllowed = "DELEGATION_NOT_ALLOWED";
        public const string StepNotSkippable = "STEP_NOT_SKIPPABLE";
        public const string SkipNotPermitted = "SKIP_NOT_PERMITTED";
        public const string RegulatoryDateReached = "REGULATORY_DATE_REACHED";
        public const string CommentsRequired = "COMMENTS_REQUIRED";
        public const string ChecklistIncomplete = "CHECKLIST_INCOMPLETE";
        public const string OutsideOwnShop = "OUTSIDE_OWN_SHOP";
        public const string InitiationCategoryInvalid = "INITIATION_CATEGORY_INVALID";
        public const string PermissionDenied = "PERMISSION_DENIED";
        public const string MandatoryFormsPending = "MANDATORY_FORMS_PENDING";
        public const string AlreadyCompleted = "ALREADY_COMPLETED";
    }
}