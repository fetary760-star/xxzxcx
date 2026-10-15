using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v10 - DocumentationWorkflowEntities.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/DocumentationWorkflowEntities.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // v9 gave the solution a GENERIC engine (FormWorkflowInstance / FormWorkflowStep /
    // FormSignature) and a DECLARATIVE catalog (FormWorkflowCatalog.Documentation.cs).
    // That is enough to move a record from role to role, but it is NOT enough to satisfy
    // the DOCUMENTATION section of the Functional Workflow Matrix, because that section
    // has four demands the generic step table cannot express:
    //
    //   (1) "Sent to the Documentation Team."
    //       The Documentation Team is a CENTRAL UNIT, not a shop. A record leaving a shop
    //       and entering that unit needs its own queue row, otherwise the DL has no inbox
    //       and no unit-level SLA can ever be measured.
    //       -> DocumentationRoutingTicket
    //
    //   (2) "DL assigns to an AVAILABLE clerk."
    //       "Available" is a fact about the clerk, not about the form. Without a
    //       per-clerk availability/workload row, "available" is unimplementable and the
    //       DL can only guess.
    //       -> DocumentationClerkWorkload
    //
    //   (3) "Re-assigned to DL for final review and sign-off."
    //       A re-assignment is a HISTORY event: which clerk, when, why, by whom. Storing
    //       only the latest assignee on the step destroys that history, and the two-year
    //       revision cycle (requirement #12) needs it.
    //       -> DocumentationAssignmentHistory
    //
    //   (4) The OUTPUT of the chain must be a register, not just an approval.
    //       MNT-1420A produces a bulletin register line; MNT-1420B produces a directive
    //       compliance line that ONLY the STL may write; MNT-1420 / MNT-1420C produce the
    //       library rows the revision triggers watch.
    //       -> BulletinRegisterEntry, DirectiveComplianceEntry, DocumentationLibraryLink
    //
    // ADDITIVE ONLY
    //   - Nothing in ApprovalStatus.cs, RoleHierarchy.cs, Enums.cs, WorkflowContracts.cs,
    //     WorkflowEntities.cs, SBForm.cs or ADForm.cs is modified.
    //   - BulletinRegisterEntry.SBFormId and DirectiveComplianceEntry.ADFormId are nullable
    //     links to your EXISTING SBForm / ADForm rows, so legacy data keeps working and the
    //     register can also exist for a bulletin that has no legacy row yet.
    //   - Every user id is long (never Guid); every entity id is Guid. This is the v4 binding
    //     rule already applied in WorkflowApiContracts.cs.
    //
    // MIGRATION
    //   dotnet ef migrations add AddDocumentationRoutingTables
    //   dotnet ef database update
    //
    // COMPANION FILES OF THE v10 AMENDMENT
    //   CMT.Domain/Models/Workflow/FormWorkflowCatalog.Documentation.cs   (amended step tables)
    //   CMT.Domain/Models/Workflow/DocumentationPermissionMatrix.cs       (role-permission matrix)
    //   CMT.Domain/Data/ApplicationDbContext.Documentation.cs             (DbSets + mapping)
    //   CMT.Application.SelfEvaluation/Contracts/Workflow/DocumentationApiContracts.cs   (API contracts)
    //   docs/AMENDMENT_v10_DOCUMENTATION_CONTRACTS.md                    (tables + matrix + API)
    // =====================================================================================

    /// <summary>
    /// Lifecycle of ONE Documentation Team queue ticket. This is the UNIT-level view;
    /// <see cref="ApprovalStatus"/> stays the FORM-level view and the two are kept in sync
    /// by the engine (see the mapping table in the contracts document).
    /// </summary>
    public enum DocumentationTicketState
    {
        /// <summary>Created but the shop has not submitted yet (form still Draft).</summary>
        NotSubmitted = 0,

        /// <summary>Routing step 1 done: the record has arrived in the Documentation Team queue.</summary>
        ReceivedByUnit = 1,

        /// <summary>Routing step 2 done: the DL has assigned an available clerk.</summary>
        AssignedToClerk = 2,

        /// <summary>The clerk has opened the ticket and is processing the entry.</summary>
        ClerkInProgress = 3,

        /// <summary>Routing step 3 reached: the clerk returned the ticket to the DL.</summary>
        ReturnedToLeader = 4,

        /// <summary>The DL has completed the final review and signed off.</summary>
        SignedOff = 5,

        /// <summary>The DL sent the ticket back to the clerk (rework inside the unit).</summary>
        ReworkByClerk = 6,

        /// <summary>Rejected by the DL and returned to the originating shop.</summary>
        RejectedToShop = 7,

        /// <summary>Cancelled: the parent form was withdrawn or superseded.</summary>
        Cancelled = 8
    }

    /// <summary>Sub-type of a bulletin registered through MNT-1420A.</summary>
    public enum BulletinDocumentType
    {
        /// <summary>Service Bulletin.</summary>
        SB = 0,

        /// <summary>Service Letter.</summary>
        SL = 1,

        /// <summary>Service Information Letter.</summary>
        SIL = 2,

        /// <summary>Any other manufacturer publication routed through the same form.</summary>
        Other = 3
    }

    /// <summary>Kind of controlled document watched in the documentation library.</summary>
    public enum DocumentationDocumentKind
    {
        /// <summary>Component Maintenance Manual (MNT-1420). Revision watch #1.</summary>
        Cmm = 0,

        /// <summary>Component Maintenance Task (MNT-1420C). Revision watch #2.</summary>
        ComponentMaintenanceTask = 1,

        /// <summary>Task Card (MNT-1420C). Revision watch #3.</summary>
        TaskCard = 2,

        /// <summary>Service Bulletin / Letter / SIL registered by MNT-1420A.</summary>
        Bulletin = 3,

        /// <summary>Airworthiness Directive issued by MNT-1420B.</summary>
        Directive = 4,

        /// <summary>Any other technical publication.</summary>
        Other = 5
    }

    /// <summary>
    /// Initiation categories of the DOCUMENTATION section.
    /// The matrix says MNT-1420A is "triggered under the Others category", which is a DATA
    /// condition, not a routing condition. The engine refuses to submit MNT-1420A unless
    /// FormDataJson.initiationCategory equals <see cref="Others"/>.
    /// </summary>
    public static class DocumentationInitiationCategories
    {
        public const string Others = "others";
        public const string Manual = "manual";
        public const string Directive = "directive";
        public const string TaskCard = "task_card";

        public static readonly string[] All = { Others, Manual, Directive, TaskCard };

        /// <summary>Case-insensitive, whitespace-tolerant equality against "others".</summary>
        public static bool IsOthers(string? value) =>
            string.Equals((value ?? string.Empty).Trim(), Others, StringComparison.OrdinalIgnoreCase);
    }

    // =====================================================================================
    // 1. DocumentationRoutingTicket  ->  table DocumentationRoutingTickets
    //    Routing steps 1, 2 and 3 of MNT-1420A, made persistent and measurable.
    // =====================================================================================

    /// <summary>
    /// One Documentation Team queue ticket. Created when a documentation form leaves the
    /// originating shop ("Sent to the Documentation Team") and closed when the DL signs off.
    /// </summary>
    public class DocumentationRoutingTicket
    {
        public Guid Id { get; set; }

        /// <summary>Human readable reference shown in the DL inbox, e.g. "DOC-2026-000481".</summary>
        [MaxLength(50)]
        public string TicketNo { get; set; } = string.Empty;

        // ----- Link back to the generic engine -----

        /// <summary>The running workflow instance this ticket belongs to.</summary>
        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>The decorated FormSubmission row, when the form has one.</summary>
        public Guid? FormSubmissionId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }

        /// <summary>FormNodeTypes.SB / FormNodeTypes.TaskCard / CmmDocumentationFormType.</summary>
        [Required]
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        /// <summary>MNT-1420 / MNT-1420A / MNT-1420C, copied from the catalog.</summary>
        [MaxLength(50)]
        public string FormNo { get; set; } = string.Empty;

        /// <summary>
        /// Value of FormDataJson.initiationCategory at submit time. For MNT-1420A this must
        /// be <see cref="DocumentationInitiationCategories.Others"/>.
        /// </summary>
        [MaxLength(50)]
        public string InitiationCategory { get; set; } = DocumentationInitiationCategories.Others;

        // ----- Origin (the shop that raised it) -----

        public Guid? OriginShopId { get; set; }
        public Guid? OriginDepartmentId { get; set; }

        public long OriginatorUserId { get; set; }

        [MaxLength(200)]
        public string OriginatorName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value of the originator (TeamLeader / Engineer).</summary>
        [MaxLength(50)]
        public string OriginatorRole { get; set; } = string.Empty;

        // ----- Routing step 1: received by the unit -----

        /// <summary>Always FunctionalUnits.Documentation. Stored so the queue query is trivial.</summary>
        [MaxLength(50)]
        public string AssignmentUnit { get; set; } = FunctionalUnits.Documentation;

        public DateTime? ReceivedByUnitAt { get; set; }

        /// <summary>DL who owns the ticket. Null while it is still in the unit pool.</summary>
        public long? DocumentationLeaderUserId { get; set; }

        [MaxLength(200)]
        public string DocumentationLeaderName { get; set; } = string.Empty;

        // ----- Routing step 2: DL assigns an available clerk -----

        public long? AssignedClerkUserId { get; set; }

        [MaxLength(200)]
        public string AssignedClerkName { get; set; } = string.Empty;

        public DateTime? AssignedAt { get; set; }

        /// <summary>DL (or Admin) who performed the assignment.</summary>
        public long? AssignedByUserId { get; set; }

        /// <summary>Snapshot of the clerk open-ticket count at assignment time (load balancing audit).</summary>
        public int ClerkOpenTicketsAtAssignment { get; set; }

        public DateTime? ClerkStartedAt { get; set; }
        public DateTime? ClerkCompletedAt { get; set; }

        /// <summary>How many times the ticket was moved from one clerk to another.</summary>
        public int ReassignmentCount { get; set; }

        public long? PreviousClerkUserId { get; set; }

        [MaxLength(500)]
        public string LastReassignReason { get; set; } = string.Empty;

        // ----- Routing step 3: back to the DL for final review and sign-off -----

        public DateTime? ReturnedToLeaderAt { get; set; }

        public DateTime? LeaderSignedOffAt { get; set; }

        /// <summary>FormSignature row produced by the DL sign-off step.</summary>
        public Guid? LeaderSignatureId { get; set; }

        /// <summary>How many times the DL sent the ticket back to the clerk for rework.</summary>
        public int ReworkCount { get; set; }

        [MaxLength(1000)]
        public string LeaderReviewComments { get; set; } = string.Empty;

        // ----- State + SLA -----

        public DocumentationTicketState State { get; set; } = DocumentationTicketState.NotSubmitted;

        /// <summary>Mirrored form-level status, so one query drives both the ToC and the inbox.</summary>
        public ApprovalStatus FormStatus { get; set; } = ApprovalStatus.Draft;

        /// <summary>1 = highest. Mandatory bulletins are raised by the clerk-assignment screen.</summary>
        public int Priority { get; set; } = 3;

        public DateTime? DueDate { get; set; }

        public bool IsOverdue { get; set; }

        public bool IsClosed { get; set; }

        [MaxLength(1000)]
        public string Notes { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // ----- Navigation -----

        public ICollection<DocumentationAssignmentHistory> AssignmentHistory { get; set; }
            = new List<DocumentationAssignmentHistory>();
    }

    // =====================================================================================
    // 2. DocumentationClerkWorkload  ->  table DocumentationClerkWorkloads
    //    Makes the word "AVAILABLE clerk" implementable.
    // =====================================================================================

    /// <summary>
    /// Availability and load of one Documentation Clerk. One row per clerk, upserted by the
    /// engine on every assignment / completion, and read by the DL assignment screen.
    /// </summary>
    public class DocumentationClerkWorkload
    {
        public Guid Id { get; set; }

        /// <summary>The clerk. Unique.</summary>
        public long ClerkUserId { get; set; }

        [MaxLength(200)]
        public string ClerkName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value; must normalise to OrgRoles.DocumentationClerk.</summary>
        [MaxLength(50)]
        public string ClerkRole { get; set; } = string.Empty;

        /// <summary>Always FunctionalUnits.Documentation.</summary>
        [MaxLength(50)]
        public string FunctionalUnit { get; set; } = FunctionalUnits.Documentation;

        /// <summary>Manually cleared by the DL, or automatically during an absence window.</summary>
        public bool IsAvailable { get; set; } = true;

        [MaxLength(300)]
        public string UnavailableReason { get; set; } = string.Empty;

        public DateTime? AbsentFrom { get; set; }
        public DateTime? AbsentTo { get; set; }

        /// <summary>Tickets currently AssignedToClerk / ClerkInProgress / ReworkByClerk.</summary>
        public int OpenTicketCount { get; set; }

        /// <summary>0 = no cap. The DL screen greys out a clerk that reached the cap.</summary>
        public int MaxConcurrentTickets { get; set; }

        public int CompletedTicketCount { get; set; }

        /// <summary>Rolling average clerk turnaround, used to sort the "available" list.</summary>
        public double AverageProcessingHours { get; set; }

        public DateTime? LastAssignedAt { get; set; }
        public DateTime? LastCompletedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Computed availability used by the assignment endpoint: available, not absent
        /// today and below the concurrency cap.
        /// </summary>
        public bool IsAssignableAt(DateTime utcNow)
        {
            if (!IsAvailable) return false;

            if (AbsentFrom.HasValue && AbsentTo.HasValue
                && utcNow >= AbsentFrom.Value && utcNow <= AbsentTo.Value)
            {
                return false;
            }

            return MaxConcurrentTickets <= 0 || OpenTicketCount < MaxConcurrentTickets;
        }
    }

    // =====================================================================================
    // 3. DocumentationAssignmentHistory  ->  table DocumentationAssignmentHistories
    //    Every assignment / re-assignment / return, so routing step 2 and 3 are auditable.
    // =====================================================================================

    /// <summary>One assignment event of a Documentation Team ticket.</summary>
    public class DocumentationAssignmentHistory
    {
        public Guid Id { get; set; }

        public Guid DocumentationRoutingTicketId { get; set; }

        /// <summary>Sequence inside the ticket, starting at 1.</summary>
        public int Sequence { get; set; }

        /// <summary>Assigned / Reassigned / Returned / Delegated / SignedOff.</summary>
        public WorkflowStepAction Action { get; set; } = WorkflowStepAction.Assigned;

        /// <summary>Step of the generic chain this event belongs to (1, 2 or 3).</summary>
        public int StepNo { get; set; }

        public long? FromUserId { get; set; }

        [MaxLength(200)]
        public string FromUserName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string FromUserRole { get; set; } = string.Empty;

        public long? ToUserId { get; set; }

        [MaxLength(200)]
        public string ToUserName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string ToUserRole { get; set; } = string.Empty;

        /// <summary>DL / Admin who performed the event.</summary>
        public long ActedByUserId { get; set; }

        [MaxLength(50)]
        public string ActedByRole { get; set; } = string.Empty;

        public DateTime ActedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(500)]
        public string Reason { get; set; } = string.Empty;

        public DocumentationTicketState StateBefore { get; set; }
        public DocumentationTicketState StateAfter { get; set; }

        public DocumentationRoutingTicket Ticket { get; set; } = null!;
    }

    // =====================================================================================
    // 4. BulletinRegisterEntry  ->  table BulletinRegisterEntries
    //    The OUTPUT of MNT-1420A: the register line the clerk fills in and the DL signs off.
    // =====================================================================================

    /// <summary>
    /// One registered Service Bulletin / Service Letter / SIL. Written by the Documentation
    /// Clerk on step 2 and frozen by the DL sign-off on step 3.
    /// </summary>
    public class BulletinRegisterEntry
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        public Guid? DocumentationRoutingTicketId { get; set; }

        /// <summary>Legacy SBForm row, when the bulletin already has one.</summary>
        public Guid? SBFormId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }

        public BulletinDocumentType DocumentType { get; set; } = BulletinDocumentType.SB;

        [Required]
        [MaxLength(100)]
        public string BulletinNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(50)]
        public string Revision { get; set; } = string.Empty;

        public DateTime? IssueDate { get; set; }

        [MaxLength(200)]
        public string IssuedBy { get; set; } = string.Empty;

        [MaxLength(20)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AffectedPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AffectedSerialNumbers { get; set; } = string.Empty;

        public BulletinCategory Category { get; set; } = BulletinCategory.Recommended;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string ComplianceMethod { get; set; } = string.Empty;

        public DateTime? ComplianceDate { get; set; }

        /// <summary>Library / archive reference written by the clerk.</summary>
        [MaxLength(300)]
        public string LibraryReference { get; set; } = string.Empty;

        [MaxLength(300)]
        public string FiledLocation { get; set; } = string.Empty;

        public bool IsEffective { get; set; } = true;

        [MaxLength(100)]
        public string SupersededByBulletinNumber { get; set; } = string.Empty;

        /// <summary>True when the register line affects the CMM and must raise a revision.</summary>
        public bool AffectsCmm { get; set; }

        [MaxLength(100)]
        public string AffectedCmmNumber { get; set; } = string.Empty;

        // ----- Signature trail, mirrored from the executed steps -----

        public long? PreparedByUserId { get; set; }

        [MaxLength(200)]
        public string PreparedByName { get; set; } = string.Empty;

        public DateTime? PreparedAt { get; set; }

        public long? ProcessedByClerkUserId { get; set; }

        [MaxLength(200)]
        public string ProcessedByClerkName { get; set; } = string.Empty;

        public DateTime? ProcessedAt { get; set; }

        public long? SignedOffByLeaderUserId { get; set; }

        [MaxLength(200)]
        public string SignedOffByLeaderName { get; set; } = string.Empty;

        public DateTime? SignedOffAt { get; set; }

        /// <summary>Set once the DL signs off. A locked row is only editable by an amendment cycle.</summary>
        public bool IsLocked { get; set; }

        [MaxLength(2000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // =====================================================================================
    // 5. DirectiveComplianceEntry  ->  table DirectiveComplianceEntries
    //    The OUTPUT of MNT-1420B. "STL holds SOLE authority to draft, process and issue."
    //    Therefore every actor column of this table is an STL, and there is deliberately
    //    NO clerk, NO DL, NO manager and NO director column.
    // =====================================================================================

    /// <summary>
    /// One Airworthiness Directive compliance line. Drafted, processed and issued by the
    /// same Shop Team Leader authority.
    /// </summary>
    public class DirectiveComplianceEntry
    {
        public Guid Id { get; set; }

        public Guid FormWorkflowInstanceId { get; set; }

        /// <summary>Legacy ADForm row, when the directive already has one.</summary>
        public Guid? ADFormId { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }

        /// <summary>Owning shop. An STL may only ever touch his own shop rows.</summary>
        public Guid ShopId { get; set; }

        [Required]
        [MaxLength(100)]
        public string ADNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(50)]
        public string Revision { get; set; } = string.Empty;

        public DateTime? EffectiveDate { get; set; }

        [MaxLength(200)]
        public string IssuingAuthority { get; set; } = string.Empty;

        [MaxLength(20)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AffectedPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AffectedModels { get; set; } = string.Empty;

        public DirectiveApplicability Applicability { get; set; } = DirectiveApplicability.NotDetermined;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string ComplianceMethod { get; set; } = string.Empty;

        public DateTime? ComplianceDueDate { get; set; }
        public DateTime? ComplianceDate { get; set; }

        public bool IsRecurring { get; set; }

        [MaxLength(200)]
        public string RecurringInterval { get; set; } = string.Empty;

        public DateTime? NextRecurrenceDate { get; set; }

        /// <summary>Related bulletin that supplies the compliance method, when any.</summary>
        [MaxLength(100)]
        public string RelatedBulletinNumber { get; set; } = string.Empty;

        // ----- Sole-authority trail: all three actors are Shop Team Leaders -----

        /// <summary>Step 0 - STL drafted the entry.</summary>
        public long DraftedByStlUserId { get; set; }

        [MaxLength(200)]
        public string DraftedByStlName { get; set; } = string.Empty;

        public DateTime? DraftedAt { get; set; }

        /// <summary>Step 1 - STL processed applicability, compliance method and due date.</summary>
        public long? ProcessedByStlUserId { get; set; }

        [MaxLength(200)]
        public string ProcessedByStlName { get; set; } = string.Empty;

        public DateTime? ProcessedAt { get; set; }

        [MaxLength(2000)]
        public string ProcessingComments { get; set; } = string.Empty;

        /// <summary>Step 2 - STL issued the final approval.</summary>
        public long? IssuedByStlUserId { get; set; }

        [MaxLength(200)]
        public string IssuedByStlName { get; set; } = string.Empty;

        public DateTime? IssuedAt { get; set; }

        /// <summary>FormSignature row of the "Issued by" block.</summary>
        public Guid? IssueSignatureId { get; set; }

        public bool IsIssued { get; set; }
        public bool IsLocked { get; set; }

        [MaxLength(2000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // =====================================================================================
    // 6. DocumentationLibraryLink  ->  table DocumentationLibraryLinks
    //    The watch list behind requirement #12: "automated updates triggered when the
    //    associated documentation (CMM, Component Maintenance Task, Task Cards) is revised."
    // =====================================================================================

    /// <summary>
    /// One controlled document watched by an evaluation folder. When
    /// <see cref="CurrentRevision"/> changes, the engine raises a FolderRevisionLog with the
    /// matching <see cref="RevisionTrigger"/>.
    /// </summary>
    public class DocumentationLibraryLink
    {
        public Guid Id { get; set; }

        public Guid? EvaluationFolderId { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }

        public DocumentationDocumentKind DocumentKind { get; set; } = DocumentationDocumentKind.Cmm;

        [Required]
        [MaxLength(200)]
        public string DocumentNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CurrentRevision { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(100)]
        public string PreviousRevision { get; set; } = string.Empty;

        /// <summary>False disables the automatic revision trigger for this row.</summary>
        public bool WatchForRevision { get; set; } = true;

        public DateTime? LastCheckedAt { get; set; }

        /// <summary>Last FolderRevisionLog raised by this row, to avoid duplicate triggers.</summary>
        public Guid? LastRaisedRevisionLogId { get; set; }

        public DateTime? LastRaisedAt { get; set; }

        /// <summary>FormNodeTypes value of the form that produced / maintains the row.</summary>
        [MaxLength(100)]
        public string SourceFormType { get; set; } = string.Empty;

        public Guid? SourceFormSubmissionId { get; set; }
        public Guid? SourceFormWorkflowInstanceId { get; set; }

        public bool IsActive { get; set; } = true;

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        /// <summary>The <see cref="RevisionTrigger"/> this document kind raises.</summary>
        public RevisionTrigger TriggerKind => DocumentKind switch
        {
            DocumentationDocumentKind.Cmm => RevisionTrigger.CmmRevised,
            DocumentationDocumentKind.ComponentMaintenanceTask => RevisionTrigger.ComponentMaintenanceTaskRevised,
            DocumentationDocumentKind.TaskCard => RevisionTrigger.TaskCardRevised,
            _ => RevisionTrigger.Manual
        };
    }
}