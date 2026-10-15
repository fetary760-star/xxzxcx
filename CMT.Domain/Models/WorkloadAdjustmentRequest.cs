using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

/// <summary>
/// Represents a request from an engineer to adjust the workload (estimated hours)
/// for a task they are assigned to. The team leader can approve or deny the request.
/// If approved, the task's effective estimated hours are updated, which in turn
/// adjusts the engineer's workload percentage and performance metrics.
/// </summary>
[Table("workload_adjustment_requests")]
public class WorkloadAdjustmentRequest : BaseEntity
{
    [Key]
    [Column("adjustment_request_id")]
    public int AdjustmentRequestId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [Column("requester_id")]
    public int RequesterId { get; set; }

    /// <summary>
    /// The original estimated hours on the task at the time of the request.
    /// </summary>
    [Required]
    [Column("original_estimated_hours")]
    public decimal OriginalEstimatedHours { get; set; }

    /// <summary>
    /// The ADDITIONAL hours the engineer is requesting (already converted to hours).
    /// This is the extra time needed, not the new total.
    /// Example: If engineer requests 2 days, this stores 14.5 (2 × 7.25).
    /// </summary>
    [Required]
    [Column("requested_estimated_hours")]
    public decimal RequestedEstimatedHours { get; set; }

    /// <summary>
    /// The raw value the engineer entered in the form (before unit conversion).
    /// Stored for display purposes: e.g. "2" when RequestUnit is "days".
    /// </summary>
    [Column("requested_raw_value")]
    public decimal RequestedRawValue { get; set; }

    /// <summary>
    /// The reason the engineer believes additional effort is needed.
    /// </summary>
    [Required]
    [Column("request_reason", TypeName = "TEXT")]
    public string RequestReason { get; set; } = string.Empty;

    /// <summary>
    /// The unit used when the request was submitted: "hours" or "days".
    /// Stored for display purposes. Internally all values are stored in hours.
    /// </summary>
    [StringLength(10)]
    [Column("request_unit")]
    public string RequestUnit { get; set; } = "hours";

    /// <summary>
    /// The previous TargetCompletionDate before the adjustment was approved.
    /// Stored for audit trail purposes.
    /// </summary>
    [Column("previous_target_completion_date")]
    public DateTime? PreviousTargetCompletionDate { get; set; }

    /// <summary>
    /// The new TargetCompletionDate after the adjustment was approved.
    /// Stored for audit trail purposes.
    /// </summary>
    [Column("new_target_completion_date")]
    public DateTime? NewTargetCompletionDate { get; set; }

    /// <summary>
    /// Current status: PendingTLReview, Approved, Rejected
    /// </summary>
    [Required]
    [StringLength(50)]
    [Column("status")]
    public string Status { get; set; } = "PendingTLReview";

    // Team Leader Review
    [Column("reviewed_by_tl_id")]
    public int? ReviewedByTlId { get; set; }

    [Column("tl_review_date")]
    public DateTime? TlReviewDate { get; set; }

    [Column("tl_review_comments", TypeName = "TEXT")]
    public string? TlReviewComments { get; set; }

    /// <summary>
    /// If the TL partially approves, they can set a different value than what was requested.
    /// Null means the full requested amount was approved (or request was rejected).
    /// </summary>
    [Column("approved_estimated_hours")]
    public decimal? ApprovedEstimatedHours { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("RequesterId")]
    public virtual User Requester { get; set; } = null!;

    [ForeignKey("ReviewedByTlId")]
    public virtual User? ReviewedByTl { get; set; }
}

public enum WorkloadAdjustmentStatus
{
    PendingTLReview = 0,
    Approved = 1,
    Rejected = 2
}