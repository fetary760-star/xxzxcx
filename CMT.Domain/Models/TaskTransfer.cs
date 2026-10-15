using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_transfers")]
public class TaskTransfer : BaseEntity
{
    [Key]
    [Column("transfer_id")]
    public int TransferId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [Column("from_user_id")]
    public int FromUserId { get; set; }

    [Required]
    [Column("to_user_id")]
    public int ToUserId { get; set; }

    [Column("reason", TypeName = "TEXT")]
    public string? Reason { get; set; }

    [Column("transfer_date")]
    public DateTime TransferDate { get; set; }

    [Column("status")]
    public TransferStatus Status { get; set; } = TransferStatus.Pending;

    [Column("approved_by")]
    public int? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("FromUserId")]
    public virtual User FromUser { get; set; } = null!;

    [ForeignKey("ToUserId")]
    public virtual User ToUser { get; set; } = null!;

    [ForeignKey("ApprovedBy")]
    public virtual User? ApprovedByUser { get; set; }
}

public enum TransferStatus
{
    Pending,
    Approved,
    Rejected,
    Completed
}