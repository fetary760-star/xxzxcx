using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("amendment_requests")]
public class AmendmentRequest : BaseEntity
{
    [Key]
    [Column("amendment_request_id")]
    public int AmendmentRequestId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Column("original_task_id")]
    public int? OriginalTaskId { get; set; }

    [Required]
    [Column("requester_id")]
    public int RequesterId { get; set; }

    [Required]
    [Column("request_reason", TypeName = "TEXT")]
    public string RequestReason { get; set; } = string.Empty;

    [StringLength(50)]
    [Column("request_type")]
    public string RequestType { get; set; } = "Amendment";

    [StringLength(50)]
    [Column("status")]
    public string Status { get; set; } = "Pending TL Review";

    [StringLength(20)]
    [Column("priority_level")]
    public string PriorityLevel { get; set; } = "Normal";

    // Team Leader Review
    [Column("reviewed_by_tl_id")]
    public int? ReviewedByTlId { get; set; }

    [Column("tl_review_date")]
    public DateTime? TlReviewDate { get; set; }

    [Column("tl_review_comments", TypeName = "TEXT")]
    public string? TlReviewComments { get; set; }

    [StringLength(20)]
    [Column("tl_decision")]
    public string? TlDecision { get; set; }

    // Director Review
    [Column("reviewed_by_director_id")]
    public int? ReviewedByDirectorId { get; set; }

    [Column("director_review_date")]
    public DateTime? DirectorReviewDate { get; set; }

    [Column("director_review_comments", TypeName = "TEXT")]
    public string? DirectorReviewComments { get; set; }

    [StringLength(20)]
    [Column("director_decision")]
    public string? DirectorDecision { get; set; }

    // Final Resolution
    [StringLength(20)]
    [Column("final_status")]
    public string FinalStatus { get; set; } = "Pending";

    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    [Column("resolved_by_id")]
    public int? ResolvedById { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties - FIXED: Remove conflicting Task relationship
    // The Task relationship is now configured from the Task side only
    public virtual Task? Task { get; set; }

    [ForeignKey("RequesterId")]
    public virtual User Requester { get; set; } = null!;

    [ForeignKey("ReviewedByTlId")]
    public virtual User? ReviewedByTl { get; set; }

    [ForeignKey("ReviewedByDirectorId")]
    public virtual User? ReviewedByDirector { get; set; }

    [ForeignKey("ResolvedById")]
    public virtual User? ResolvedBy { get; set; }

    public virtual ICollection<AmendmentAuditTrail> AuditTrail { get; set; } = new List<AmendmentAuditTrail>();
}

[Table("amendment_audit_trail")]
public class AmendmentAuditTrail : BaseEntity
{
    [Key]
    [Column("audit_id")]
    public int AuditId { get; set; }

    [Required]
    [Column("amendment_request_id")]
    public int AmendmentRequestId { get; set; }

    // CRITICAL FIX: TaskId is now just an integer field, NOT a foreign key
    // This prevents FK constraint violations when tasks are moved to completed_tasks
    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [StringLength(50)]
    [Column("action_type")]
    public string ActionType { get; set; } = string.Empty;

    [Required]
    [Column("action_by_user_id")]
    public int ActionByUserId { get; set; }

    [Required]
    [StringLength(50)]
    [Column("action_by_role")]
    public string ActionByRole { get; set; } = string.Empty;

    [StringLength(50)]
    [Column("previous_status")]
    public string? PreviousStatus { get; set; }

    [Required]
    [StringLength(50)]
    [Column("new_status")]
    public string NewStatus { get; set; } = string.Empty;

    [Column("action_comments", TypeName = "TEXT")]
    public string? ActionComments { get; set; }

    [Column("action_timestamp")]
    public DateTime ActionTimestamp { get; set; }

    [StringLength(45)]
    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [StringLength(500)]
    [Column("user_agent")]
    public string? UserAgent { get; set; }

    [StringLength(100)]
    [Column("session_id")]
    public string? SessionId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    [ForeignKey("AmendmentRequestId")]
    public virtual AmendmentRequest AmendmentRequest { get; set; } = null!;

    // REMOVED: Task navigation property to prevent FK constraint issues
    // Task information is stored in TaskId as a simple integer

    [ForeignKey("ActionByUserId")]
    public virtual User ActionByUser { get; set; } = null!;
}

[Table("task_status_history")]
public class TaskStatusHistory : BaseEntity
{
    [Key]
    [Column("history_id")]
    public int HistoryId { get; set; }

    // CRITICAL FIX: TaskId is now just an integer field, NOT a foreign key
    // This prevents FK constraint violations when tasks are moved to completed_tasks
    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Column("original_task_id")]
    public int? OriginalTaskId { get; set; }

    [StringLength(20)]
    [Column("previous_status")]
    public string? PreviousStatus { get; set; }

    [Required]
    [StringLength(20)]
    [Column("new_status")]
    public string NewStatus { get; set; } = string.Empty;

    [Column("status_change_reason", TypeName = "TEXT")]
    public string? StatusChangeReason { get; set; }

    [Required]
    [Column("changed_by_user_id")]
    public int ChangedByUserId { get; set; }

    [Required]
    [StringLength(50)]
    [Column("changed_by_role")]
    public string ChangedByRole { get; set; } = string.Empty;

    [Column("change_timestamp")]
    public DateTime ChangeTimestamp { get; set; }

    [Column("is_reopen_action")]
    public bool IsReopenAction { get; set; } = false;

    [Column("reopen_count")]
    public int ReopenCount { get; set; } = 0;

    [StringLength(500)]
    [Column("assigned_engineers")]
    public string? AssignedEngineers { get; set; }

    [Column("related_amendment_request_id")]
    public int? RelatedAmendmentRequestId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    // REMOVED: Task navigation property to prevent FK constraint issues
    // Task information is stored in TaskId as a simple integer

    [ForeignKey("ChangedByUserId")]
    public virtual User ChangedByUser { get; set; } = null!;

    [ForeignKey("RelatedAmendmentRequestId")]
    public virtual AmendmentRequest? RelatedAmendmentRequest { get; set; }
}

// Enums for amendment workflow
public enum AmendmentRequestStatus
{
    PendingTLReview = 0,
    ForwardedToDirector = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4
}

public enum AmendmentActionType
{
    Created,
    TLReview,
    DirectorReview,
    Approved,
    Rejected,
    Forwarded,
    Cancelled,
    Reopened
}

public enum AmendmentPriorityLevel
{
    Low,
    Normal,
    High,
    Critical
}