using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using CMT.Domain.Enums;
using TaskStatus = CMT.Domain.Enums.TaskStatus;
using AmendmentStatus = CMT.Domain.Enums.AmendmentStatus;

namespace CMT.Domain.Models;

[Table("tasks")]
public class Task : BaseEntity
{
    [Key]
    [Column("task_id")]
    public int TaskId { get; set; }

    [StringLength(100)]
    [Column("serial_number")]
    public string? SerialNumber { get; set; }

    [StringLength(100)]
    [Column("part_number")]
    public string? PartNumber { get; set; }

    [StringLength(100)]
    [Column("po_number")]
    public string? PoNumber { get; set; }

    [Required]
    [Column("description", TypeName = "TEXT")]
    public string Description { get; set; } = string.Empty;

    [Required]
    [Column("category_id")]
    public int CategoryId { get; set; }

    [Column("sub_type_id")]
    public int? SubTypeId { get; set; }

    [Column("request_type_id")]
    public int? RequestTypeId { get; set; }

    [Column("status")]
    public TaskStatus Status { get; set; } = TaskStatus.Pending;

    [Column("comments", TypeName = "TEXT")]
    public string? Comments { get; set; }

    [StringLength(255)]
    [Column("assigned_engineer")]
    public string AssignedEngineer { get; set; } = "Unassigned";

    [Column("priority_id")]
    public int? PriorityId { get; set; }

    [Required]
    [Column("estimated_completion_date")]
    public DateTime EstimatedCompletionDate { get; set; }

    /// <summary>
    /// The original target completion date/time.
    /// CRITICAL FIX: Always stored and retrieved as UTC (DateTimeKind.Utc).
    /// Frontend must convert to user's local timezone for display.
    /// </summary>
    [Column("target_completion_date")]
    public DateTime? TargetCompletionDate { get; set; }

    [Column("actual_completion_date")]
    public DateTime? ActualCompletionDate { get; set; }

    // NEW: Scheduling fields for workload management
    [Column("estimated_hours")]
    public decimal? EstimatedHours { get; set; } = 8.0m;

    /// <summary>
    /// The adjusted estimated hours after a workload adjustment request is approved by the Team Leader.
    /// When set, this value overrides EstimatedHours for workload percentage and performance calculations.
    /// Null means no adjustment has been approved — use EstimatedHours as-is.
    /// </summary>
    [Column("adjusted_estimated_hours")]
    public decimal? AdjustedEstimatedHours { get; set; }

    [Column("planned_start_date")]
    public DateTime? PlannedStartDate { get; set; }

    [Column("planned_end_date")]
    public DateTime? PlannedEndDate { get; set; }

    [StringLength(255)]
    [Column("attachment_path")]
    public string? AttachmentPath { get; set; }

    // Amendment fields (already exist)
    [Column("amendment_request")]
    public bool AmendmentRequest { get; set; } = false;

    [Column("amendment_status")]
    public AmendmentStatus? AmendmentStatus { get; set; }

    [Column("amendment_reviewed_by_tl_id")]
    public int? AmendmentReviewedByTlId { get; set; }

    // ADDED: Missing amendment-related properties that AmendmentService is trying to access
    [Column("amendment_request_id")]
    public int? AmendmentRequestId { get; set; }

    [Column("amendment_requested_at")]
    public DateTime? AmendmentRequestedAt { get; set; }

    [Column("amendment_requested_by")]
    public int? AmendmentRequestedBy { get; set; }

    [Column("amendment_reason")]
    public string? AmendmentReason { get; set; }

    // Reopened task fields - NEW
    [Column("is_reopened")]
    public bool IsReopened { get; set; } = false;

    [Column("reopen_count")]
    public int ReopenCount { get; set; } = 0;

    [Column("reopened_by")]
    public int? ReopenedBy { get; set; }

    [Column("reopened_at")]
    public DateTime? ReopenedAt { get; set; }

    [Column("reopen_reason")]
    public string? ReopenReason { get; set; }

    [Column("is_duplicate")]
    public bool IsDuplicate { get; set; } = false;

    [Column("duplicate_justification", TypeName = "TEXT")]
    public string? DuplicateJustification { get; set; }

    [Column("revision_notes", TypeName = "TEXT")]
    public string? RevisionNotes { get; set; }

    [Column("show_revision_alert")]
    public bool ShowRevisionAlert { get; set; } = false;

    [Column("shop_id")]
    public int? ShopId { get; set; }

    [Required]
    [Column("created_by")]
    public int CreatedBy { get; set; }

    [Column("is_mandatory")]
    public bool IsMandatory { get; set; } = false;

    [Column("rejected_by")]
    public int? RejectedBy { get; set; }

    [Column("rejected_at")]
    public DateTime? RejectedAt { get; set; }

    [Column("rejection_reason", TypeName = "TEXT")]
    public string? RejectionReason { get; set; }

    [Column("cancelled_by")]
    public int? CancelledBy { get; set; }

    [Column("cancellation_reason", TypeName = "TEXT")]
    public string? CancellationReason { get; set; }

    [Column("cancelled_at")]
    public DateTime? CancelledAt { get; set; }

    // Pause/Resume fields
    [Column("is_paused")]
    public bool IsPaused { get; set; } = false;

    [Column("paused_at")]
    public DateTime? PausedAt { get; set; }

    [Column("paused_reason", TypeName = "TEXT")]
    public string? PausedReason { get; set; }

    [Column("total_paused_duration_minutes")]
    public long TotalPausedDurationMinutes { get; set; } = 0;

    [Column("last_resumed_at")]
    public DateTime? LastResumedAt { get; set; }

    [Column("paused_by")]
    public int? PausedBy { get; set; }

    /// <summary>
    /// The date/time when the task status was last changed.
    /// Updated whenever Status transitions (e.g., Pending → InProgress, InProgress → OnHold, etc.).
    /// Used by the frontend to track when exactly the status changed and for overdue calculations.
    /// </summary>
    [Column("status_changed_at")]
    public DateTime? StatusChangedAt { get; set; }

    /// <summary>
    /// The date/time when the task was assigned to an engineer.
    /// Used for performance metrics calculations instead of CreatedAt.
    /// Set automatically when AssignedEngineer is changed from "Unassigned" to an actual engineer name.
    /// </summary>
    [Column("assigned_at")]
    public DateTime? AssignedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("CategoryId")]
    public virtual TaskCategory Category { get; set; } = null!;

    [ForeignKey("SubTypeId")]
    public virtual TaskSubType? SubType { get; set; }

    [ForeignKey("RequestTypeId")]
    public virtual RequestType? RequestType { get; set; }

    [ForeignKey("PriorityId")]
    public virtual TaskPriorityLevel? Priority { get; set; }

    [ForeignKey("CreatedBy")]
    public virtual User Creator { get; set; } = null!;

    [ForeignKey("AmendmentReviewedByTlId")]
    public virtual User? AmendmentReviewer { get; set; }

    [ForeignKey("ReopenedBy")]
    public virtual User? ReopenedByUser { get; set; }

    [ForeignKey("ShopId")]
    public virtual Shop? Shop { get; set; }

    [ForeignKey("RejectedBy")]
    public virtual User? RejectedByUser { get; set; }

    [ForeignKey("CancelledBy")]
    public virtual User? CancelledByUser { get; set; }

    [ForeignKey("PausedBy")]
    public virtual User? PausedByUser { get; set; }

    // ADDED: Navigation properties for amendment-related fields
    [ForeignKey("AmendmentRequestId")]
    public virtual AmendmentRequest? AmendmentRequestEntity { get; set; }

    [ForeignKey("AmendmentRequestedBy")]
    public virtual User? AmendmentRequester { get; set; }

    public virtual ICollection<TaskComment> TaskComments { get; set; } = new List<TaskComment>();
    public virtual ICollection<TaskAttachment> Attachments { get; set; } = new List<TaskAttachment>();

    // ─────────────────────────────────────────────────────────────────────────────
    // CRITICAL FIX: Helper to ensure all DateTime properties are treated as UTC
    // Call this after materializing from EF Core when DateTimeKind is Unspecified.
    // ─────────────────────────────────────────────────────────────────────────────
    public void EnsureUtcDateTimeKinds()
    {
        CreatedAt = DateTime.SpecifyKind(CreatedAt, DateTimeKind.Utc);
        UpdatedAt = DateTime.SpecifyKind(UpdatedAt, DateTimeKind.Utc);
        EstimatedCompletionDate = DateTime.SpecifyKind(EstimatedCompletionDate, DateTimeKind.Utc);

        if (TargetCompletionDate.HasValue)
            TargetCompletionDate = DateTime.SpecifyKind(TargetCompletionDate.Value, DateTimeKind.Utc);
        if (ActualCompletionDate.HasValue)
            ActualCompletionDate = DateTime.SpecifyKind(ActualCompletionDate.Value, DateTimeKind.Utc);
        if (AssignedAt.HasValue)
            AssignedAt = DateTime.SpecifyKind(AssignedAt.Value, DateTimeKind.Utc);
        if (StatusChangedAt.HasValue)
            StatusChangedAt = DateTime.SpecifyKind(StatusChangedAt.Value, DateTimeKind.Utc);
        if (ReopenedAt.HasValue)
            ReopenedAt = DateTime.SpecifyKind(ReopenedAt.Value, DateTimeKind.Utc);
        if (RejectedAt.HasValue)
            RejectedAt = DateTime.SpecifyKind(RejectedAt.Value, DateTimeKind.Utc);
        if (CancelledAt.HasValue)
            CancelledAt = DateTime.SpecifyKind(CancelledAt.Value, DateTimeKind.Utc);
        if (PausedAt.HasValue)
            PausedAt = DateTime.SpecifyKind(PausedAt.Value, DateTimeKind.Utc);
        if (LastResumedAt.HasValue)
            LastResumedAt = DateTime.SpecifyKind(LastResumedAt.Value, DateTimeKind.Utc);
        if (PlannedStartDate.HasValue)
            PlannedStartDate = DateTime.SpecifyKind(PlannedStartDate.Value, DateTimeKind.Utc);
        if (PlannedEndDate.HasValue)
            PlannedEndDate = DateTime.SpecifyKind(PlannedEndDate.Value, DateTimeKind.Utc);
        if (AmendmentRequestedAt.HasValue)
            AmendmentRequestedAt = DateTime.SpecifyKind(AmendmentRequestedAt.Value, DateTimeKind.Utc);
    }
}