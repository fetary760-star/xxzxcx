using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_hold_requests")]
public class TaskHoldRequest : BaseEntity
{
    [Key]
    [Column("hold_request_id")]
    public int HoldRequestId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [Column("requested_by_engineer_id")]
    public int RequestedByEngineerId { get; set; }

    [Required]
    [Column("hold_reason", TypeName = "TEXT")]
    public string HoldReason { get; set; } = string.Empty;

    [Column("days_worked_by_engineer")]
    public int DaysWorkedByEngineer { get; set; } = 0;

    [Column("assigned_date")]
    public DateTime? AssignedDate { get; set; }

    [Column("hold_requested_date")]
    public DateTime HoldRequestedDate { get; set; }

    [StringLength(50)]
    [Column("status")]
    public string Status { get; set; } = "PendingApproval"; // PendingApproval, Approved, Rejected

    [Column("reviewed_by_tl_id")]
    public int? ReviewedByTlId { get; set; }

    [Column("review_date")]
    public DateTime? ReviewDate { get; set; }

    [Column("review_comments", TypeName = "TEXT")]
    public string? ReviewComments { get; set; }

    [Column("days_transferred_to_tl")]
    public int? DaysTransferredToTl { get; set; }

    [Column("action_taken")]
    public string? ActionTaken { get; set; } // "TransferredToTL", "ReturnedToInitiator", "MaintainedStatus"

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("RequestedByEngineerId")]
    public virtual User RequestedByEngineer { get; set; } = null!;

    [ForeignKey("ReviewedByTlId")]
    public virtual User? ReviewedByTl { get; set; }
}

[Table("user_date_counts")]
public class UserDateCount : BaseEntity
{
    [Key]
    [Column("date_count_id")]
    public int DateCountId { get; set; }

    [Required]
    [Column("user_id")]
    public int UserId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Column("date_count")]
    public int DateCount { get; set; } = 0;

    [StringLength(50)]
    [Column("count_type")]
    public string CountType { get; set; } = "WorkDays"; // WorkDays, TransferredFromEngineer

    [Column("start_date")]
    public DateTime? StartDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Column("transferred_from_user_id")]
    public int? TransferredFromUserId { get; set; }

    [Column("transfer_reason", TypeName = "TEXT")]
    public string? TransferReason { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("UserId")]
    public virtual User User { get; set; } = null!;

    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("TransferredFromUserId")]
    public virtual User? TransferredFromUser { get; set; }
}

public enum HoldRequestStatus
{
    PendingApproval = 0,
    Approved = 1,
    Rejected = 2
}

public enum HoldRequestAction
{
    TransferredToTL,
    ReturnedToInitiator,
    MaintainedStatus
}