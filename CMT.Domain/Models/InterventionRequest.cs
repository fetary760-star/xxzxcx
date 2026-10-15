using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("intervention_requests")]
public class InterventionRequest : BaseEntity
{
    [Key]
    [Column("intervention_id")]
    public int InterventionId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [Column("requested_by")]
    public int RequestedBy { get; set; }

    [Column("requested_at")]
    public DateTime RequestedAt { get; set; }

    [Required]
    [StringLength(50)]
    [Column("escalation_level")]
    public string EscalationLevel { get; set; } = "team_lead"; // team_lead, director

    [Required]
    [StringLength(50)]
    [Column("status")]
    public string Status { get; set; } = "pending"; // pending, acknowledged, resolved, escalated

    [Column("comments", TypeName = "NVARCHAR(MAX)")]
    public string? Comments { get; set; }

    [StringLength(50)]
    [Column("user_role")]
    public string? UserRole { get; set; }

    [Column("acknowledged_at")]
    public DateTime? AcknowledgedAt { get; set; }

    [Column("acknowledged_by")]
    public int? AcknowledgedBy { get; set; }

    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    [Column("resolved_by")]
    public int? ResolvedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("RequestedBy")]
    public virtual User RequestedByUser { get; set; } = null!;

    [ForeignKey("AcknowledgedBy")]
    public virtual User? AcknowledgedByUser { get; set; }

    [ForeignKey("ResolvedBy")]
    public virtual User? ResolvedByUser { get; set; }
}