using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

/// <summary>
/// Tracks all updates made to tasks, including who made the update and when.
/// This provides a complete audit trail for task modifications.
/// </summary>
[Table("task_update_history")]
public class TaskUpdateHistory : BaseEntity
{
    [Key]
    [Column("update_history_id")]
    public int UpdateHistoryId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [Column("updated_by_user_id")]
    public int UpdatedByUserId { get; set; }

    [StringLength(100)]
    [Column("updated_by_user_name")]
    public string UpdatedByUserName { get; set; } = string.Empty;

    [StringLength(50)]
    [Column("updated_by_user_role")]
    public string? UpdatedByUserRole { get; set; }

    [Required]
    [Column("update_type")]
    [StringLength(50)]
    public string UpdateType { get; set; } = "GENERAL_UPDATE"; // GENERAL_UPDATE, STATUS_CHANGE, ASSIGNMENT_CHANGE, PRIORITY_CHANGE, etc.

    [Column("field_name")]
    [StringLength(100)]
    public string? FieldName { get; set; }

    [Column("old_value", TypeName = "TEXT")]
    public string? OldValue { get; set; }

    [Column("new_value", TypeName = "TEXT")]
    public string? NewValue { get; set; }

    [Column("update_comment", TypeName = "TEXT")]
    public string? UpdateComment { get; set; }

    [Column("ip_address")]
    [StringLength(50)]
    public string? IpAddress { get; set; }

    [Required]
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // FIXED: Added CreatedAt property to match BaseEntity pattern
    [Required]
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("UpdatedByUserId")]
    public virtual User UpdatedByUser { get; set; } = null!;
}