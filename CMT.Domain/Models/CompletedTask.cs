using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using CMT.Domain.Enums;
using TaskStatus = CMT.Domain.Enums.TaskStatus;
using AmendmentStatus = CMT.Domain.Enums.AmendmentStatus;

namespace CMT.Domain.Models;

[Table("completed_tasks")]
public class CompletedTask : BaseEntity
{
    [Key]
    [Column("completed_task_id")]
    public int CompletedTaskId { get; set; }

    [Column("original_task_id")]
    public int OriginalTaskId { get; set; }

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
    public TaskStatus Status { get; set; } = TaskStatus.Completed;

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
    /// The target completion date/time — may reflect deadline extensions.
    /// CRITICAL FIX: Always stored and retrieved as UTC (DateTimeKind.Utc).
    /// Frontend must convert to user's local timezone for display.
    /// When a deadline extension is granted, this field is updated to the new target date.
    /// Performance metrics (Early/On-Time/Delayed) are calculated against this value.
    /// </summary>
    [Column("target_completion_date")]
    public DateTime? TargetCompletionDate { get; set; }

    [Column("actual_completion_date")]
    public DateTime? ActualCompletionDate { get; set; }

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

    // ADDED: Missing amendment-related properties to match Task model
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

    /// <summary>
    /// The date/time when the task was assigned to an engineer (copied from Task.AssignedAt).
    /// Used for performance metrics calculations instead of TaskCreatedAt.
    /// </summary>
    [Column("task_assigned_at")]
    public DateTime? TaskAssignedAt { get; set; }

    /// <summary>
    /// The date/time when the engineer marked the task as completed (selected "Completed" status and saved).
    /// This is copied from Task.ActualCompletionDate which is set at the PendingTLApproval step.
    /// Distinct from CompletedAt which records when MoveTaskToCompletedAsync runs (TL approval time).
    /// </summary>
    [Column("engineer_completed_at")]
    public DateTime? EngineerCompletedAt { get; set; }

    [Column("task_created_at")]
    public DateTime TaskCreatedAt { get; set; }

    [Column("task_updated_at")]
    public DateTime TaskUpdatedAt { get; set; }

    [Column("completed_at")]
    public DateTime CompletedAt { get; set; }

    [Column("moved_to_completed_at")]
    public DateTime MovedToCompletedAt { get; set; }

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

    // ADDED: Navigation properties for amendment-related fields
    [ForeignKey("AmendmentRequestedBy")]
    public virtual User? AmendmentRequester { get; set; }

    public virtual ICollection<CompletedTaskComment> TaskComments { get; set; } = new List<CompletedTaskComment>();
    public virtual ICollection<CompletedTaskAttachment> Attachments { get; set; } = new List<CompletedTaskAttachment>();

    // ─────────────────────────────────────────────────────────────────────────────
    // CRITICAL FIX: Helper to ensure all DateTime properties are treated as UTC.
    // When EF Core reads DateTime from the database without explicit type info,
    // it may set DateTimeKind.Unspecified. This causes the JSON serializer to
    // omit the "Z" suffix, and the frontend interprets it as local time — leading
    // to the discrepancy where "10:55:56 AM UTC" displays as "6:08:59 AM" (local).
    // Call this after materializing from EF Core.
    // ─────────────────────────────────────────────────────────────────────────────
    public void EnsureUtcDateTimeKinds()
    {
        TaskCreatedAt = DateTime.SpecifyKind(TaskCreatedAt, DateTimeKind.Utc);
        TaskUpdatedAt = DateTime.SpecifyKind(TaskUpdatedAt, DateTimeKind.Utc);
        CompletedAt = DateTime.SpecifyKind(CompletedAt, DateTimeKind.Utc);
        MovedToCompletedAt = DateTime.SpecifyKind(MovedToCompletedAt, DateTimeKind.Utc);
        EstimatedCompletionDate = DateTime.SpecifyKind(EstimatedCompletionDate, DateTimeKind.Utc);

        if (TargetCompletionDate.HasValue)
            TargetCompletionDate = DateTime.SpecifyKind(TargetCompletionDate.Value, DateTimeKind.Utc);
        if (ActualCompletionDate.HasValue)
            ActualCompletionDate = DateTime.SpecifyKind(ActualCompletionDate.Value, DateTimeKind.Utc);
        if (TaskAssignedAt.HasValue)
            TaskAssignedAt = DateTime.SpecifyKind(TaskAssignedAt.Value, DateTimeKind.Utc);
        if (EngineerCompletedAt.HasValue)
            EngineerCompletedAt = DateTime.SpecifyKind(EngineerCompletedAt.Value, DateTimeKind.Utc);
        if (ReopenedAt.HasValue)
            ReopenedAt = DateTime.SpecifyKind(ReopenedAt.Value, DateTimeKind.Utc);
        if (RejectedAt.HasValue)
            RejectedAt = DateTime.SpecifyKind(RejectedAt.Value, DateTimeKind.Utc);
        if (CancelledAt.HasValue)
            CancelledAt = DateTime.SpecifyKind(CancelledAt.Value, DateTimeKind.Utc);
        if (AmendmentRequestedAt.HasValue)
            AmendmentRequestedAt = DateTime.SpecifyKind(AmendmentRequestedAt.Value, DateTimeKind.Utc);
    }
}

[Table("completed_task_comments")]
public class CompletedTaskComment : BaseEntity
{
    [Key]
    [Column("comment_id")]
    public int CommentId { get; set; }

    [Required]
    [Column("completed_task_id")]
    public int CompletedTaskId { get; set; }

    [Required]
    [Column("author_id")]
    public int AuthorId { get; set; }

    [Required]
    [Column("comment_text", TypeName = "TEXT")]
    public string CommentText { get; set; } = string.Empty;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    [ForeignKey("CompletedTaskId")]
    public virtual CompletedTask CompletedTask { get; set; } = null!;

    [ForeignKey("AuthorId")]
    public virtual User Author { get; set; } = null!;
}

[Table("completed_task_attachments")]
public class CompletedTaskAttachment : BaseEntity
{
    [Key]
    [Column("attachment_id")]
    public int AttachmentId { get; set; }

    [Required]
    [Column("completed_task_id")]
    public int CompletedTaskId { get; set; }

    [Required]
    [StringLength(255)]
    [Column("file_name")]
    public string FileName { get; set; } = string.Empty;

    [Required]
    [StringLength(500)]
    [Column("file_path")]
    public string FilePath { get; set; } = string.Empty;

    [StringLength(100)]
    [Column("file_type")]
    public string? FileType { get; set; }

    [Column("file_size")]
    public long? FileSize { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; }

    [ForeignKey("CompletedTaskId")]
    public virtual CompletedTask CompletedTask { get; set; } = null!;
}