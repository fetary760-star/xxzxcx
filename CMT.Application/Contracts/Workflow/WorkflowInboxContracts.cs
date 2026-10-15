using System;
using System.Collections.Generic;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Contracts.Workflow
{
    // =====================================================================================
    // AMENDED - WorkflowInboxContracts.cs   (NEW FILE, PURELY ADDITIVE)
    // Copy to: CMT.Application.SelfEvaluation/Contracts/Workflow/WorkflowInboxContracts.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // The reported defect was two 404s plus an empty sidebar:
    //
    //     GET /api/workflow/inbox?scope=all&pageSize=500   404
    //     GET /api/evaluation-folders?pageSize=500         404
    //     -> sidebar renders "Request counts unavailable - check the workflow service."
    //
    // The root cause is ROUTING, not runtime logic:
    //   (1) WorkflowController is declared [Route("api/self-evaluation/[controller]")], so
    //       its real base path is /api/self-evaluation/workflow and it only exposes
    //       audit-logs/... and delegations/shop/{shopId}. No "inbox" action exists anywhere.
    //   (2) No controller is mapped to /api/evaluation-folders at all. The nearest match,
    //       TableOfContentController, lives under /api/self-evaluation/table-of-content.
    //
    // Because both calls 404, the dashboard's count fetch rejects and the role sidebar falls
    // back to its error state, so Assigned / Pending / Completed / Reviewed / Rejected are
    // never rendered for any role.
    //
    // WHAT THIS FILE ADDS
    // -------------------
    // The transport shapes for the restored inbox. WorkflowApiContracts.InboxItemResponse is
    // `sealed`, so it cannot be extended; WorkflowInboxItem is therefore a SUPERSET of it -
    // every existing field keeps its exact name and meaning, and the sidebar-specific fields
    // (StatusBucket, OwnerRole, ATAChapterCode, PartNumber) are appended. JSON is structural,
    // so a client that already types the response as InboxItemResponse[] keeps working
    // unchanged while the new dashboard can read the extra fields.
    //
    // BINDING RULES (identical to WorkflowApiContracts):
    //   - every user id is long, NEVER Guid;
    //   - every entity id (instance / submission / folder) stays Guid;
    //   - every enum is ALSO exposed as a string label, so the frontend never re-implements
    //     ApprovalStatusInfo.Label / RoleHierarchy.Label switch statements.
    // =====================================================================================

    /// <summary>
    /// The five workflow buckets rendered by the role sidebar. Exposed as string constants
    /// (not an enum) so the JSON payload is self-describing and the frontend can group on the
    /// value without a mapping table.
    /// </summary>
    public static class WorkflowStatusBuckets
    {
        /// <summary>Pending AND a concrete person owns the step.</summary>
        public const string Assigned = "Assigned";

        /// <summary>Pending but still sitting in a role / unit queue, nobody picked it up.</summary>
        public const string Pending = "Pending";

        /// <summary>The whole chain finished (Approved / Completed / Locked / Skipped).</summary>
        public const string Completed = "Completed";

        /// <summary>This role already executed a step, but the chain is still running.</summary>
        public const string Reviewed = "Reviewed";

        /// <summary>Rejected / Returned / Revoked - back with the originator.</summary>
        public const string Rejected = "Rejected";

        public static readonly string[] All =
        {
            Assigned, Pending, Completed, Reviewed, Rejected
        };
    }

    /// <summary>Accepted values of the <c>scope</c> query parameter of GET /api/workflow/inbox.</summary>
    public static class WorkflowInboxScopes
    {
        /// <summary>Only rows the caller personally touches (default).</summary>
        public const string Mine = "mine";

        /// <summary>Everything the caller may see - drives the role sidebar.</summary>
        public const string All = "all";

        /// <summary>Everything inside the caller's shop.</summary>
        public const string Shop = "shop";
    }

    /// <summary>
    /// The canonical roles rendered by the dashboard sidebar, in display order, together with
    /// the exact captions used by the UI ("Shop Team Leader", "CAA Officer", "QA Manager",
    /// "Documentation"). Kept here so the API and the sidebar cannot drift apart.
    /// </summary>
    public sealed class WorkflowRoleDescriptor
    {
        public string Role { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
    }

    /// <summary>
    /// One row of the workflow inbox. SUPERSET of
    /// <see cref="InboxItemResponse"/>: identical field names first, sidebar additions after.
    /// </summary>
    public sealed class WorkflowInboxItem
    {
        // ----- Identity (same names as InboxItemResponse) -----

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

        /// <summary>True when the row is in a role / unit queue, not personally assigned.</summary>
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

        // ----- Sidebar additions -----

        /// <summary>One of <see cref="WorkflowStatusBuckets"/>, computed for the caller.</summary>
        public string StatusBucket { get; set; } = WorkflowStatusBuckets.Pending;

        public FormLifecycleState LifecycleState { get; set; }
        public string LifecycleStateLabel { get; set; } = string.Empty;

        /// <summary>Canonical role currently responsible for the row (may be empty).</summary>
        public string OwnerRole { get; set; } = string.Empty;
        public string OwnerRoleLabel { get; set; } = string.Empty;

        /// <summary>Every canonical role eligible to act on the pending step.</summary>
        public List<string> EligibleRoles { get; set; } = new();
        public List<string> EligibleRoleLabels { get; set; } = new();

        public long? CurrentAssigneeUserId { get; set; }
        public string CurrentAssigneeName { get; set; } = string.Empty;

        public long OriginatorUserId { get; set; }

        // ----- Identification required by the sidebar: ATA (ETA) + Part Number -----

        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }

        /// <summary>ATA chapter code of the owning folder, e.g. "32-41".</summary>
        public string ATAChapterCode { get; set; } = string.Empty;

        /// <summary>
        /// Alias of <see cref="ATAChapterCode"/>. The dashboard labels this column "ETA";
        /// both names are emitted so neither spelling has to be patched in the frontend.
        /// </summary>
        public string ETAReference { get; set; } = string.Empty;

        public string PartNumber { get; set; } = string.Empty;
        public string FolderCode { get; set; } = string.Empty;
        public string FolderTitle { get; set; } = string.Empty;

        /// <summary>Deep link the sidebar uses when the row is clicked.</summary>
        public string ActionUrl { get; set; } = string.Empty;

        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>The five counters of one sidebar row.</summary>
    public sealed class WorkflowStatusCounts
    {
        public int Assigned { get; set; }
        public int Pending { get; set; }
        public int Completed { get; set; }
        public int Reviewed { get; set; }
        public int Rejected { get; set; }

        public int Total => Assigned + Pending + Completed + Reviewed + Rejected;

        public void Add(string bucket)
        {
            switch (bucket)
            {
                case WorkflowStatusBuckets.Assigned: Assigned++; break;
                case WorkflowStatusBuckets.Pending: Pending++; break;
                case WorkflowStatusBuckets.Completed: Completed++; break;
                case WorkflowStatusBuckets.Reviewed: Reviewed++; break;
                case WorkflowStatusBuckets.Rejected: Rejected++; break;
            }
        }
    }

    /// <summary>One role block of the sidebar, e.g. "Shop Team Leader" with its five counts.</summary>
    public sealed class WorkflowRoleCounts
    {
        public string Role { get; set; } = string.Empty;
        public string RoleLabel { get; set; } = string.Empty;

        /// <summary>True for the role of the calling user, so the UI can highlight it.</summary>
        public bool IsMyRole { get; set; }

        public WorkflowStatusCounts Counts { get; set; } = new();

        /// <summary>
        /// The instance ids behind the counters, so the sidebar can filter the request list
        /// without a second round trip.
        /// </summary>
        public List<Guid> InstanceIds { get; set; } = new();
    }

    /// <summary>
    /// GET /api/workflow/inbox/counts - everything the role sidebar needs in ONE call.
    /// </summary>
    public sealed class WorkflowInboxCountsResponse
    {
        public long UserId { get; set; }
        public string Role { get; set; } = string.Empty;
        public string RoleLabel { get; set; } = string.Empty;
        public Guid? ShopId { get; set; }

        public string Scope { get; set; } = WorkflowInboxScopes.All;

        /// <summary>Aggregate over every role visible to the caller.</summary>
        public WorkflowStatusCounts Totals { get; set; } = new();

        /// <summary>Counts of the calling user personally ("My Requests").</summary>
        public WorkflowStatusCounts Mine { get; set; } = new();

        /// <summary>One block per sidebar role, in display order.</summary>
        public List<WorkflowRoleCounts> Roles { get; set; } = new();

        public int ItemCount { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    }
}