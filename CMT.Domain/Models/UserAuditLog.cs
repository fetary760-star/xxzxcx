using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("user_audit_logs")]
public class UserAuditLog : BaseEntity
{
    [Key]
    [Column("audit_id")]
    public int AuditId { get; set; }

    [Required]
    [Column("action_type")]
    [StringLength(50)]
    public string ActionType { get; set; } = string.Empty; // CREATE, UPDATE, DELETE

    [Required]
    [Column("target_user_id")]
    public int TargetUserId { get; set; }

    [Column("target_username")]
    [StringLength(50)]
    public string? TargetUsername { get; set; }

    [Column("target_user_role")]
    [StringLength(50)]
    public string? TargetUserRole { get; set; }

    [Required]
    [Column("performed_by_user_id")]
    public int PerformedByUserId { get; set; }

    [Column("performed_by_username")]
    [StringLength(50)]
    public string? PerformedByUsername { get; set; }

    [Column("performed_by_role")]
    [StringLength(50)]
    public string? PerformedByRole { get; set; }

    [Column("changes_made", TypeName = "TEXT")]
    public string? ChangesMade { get; set; }

    [Column("reason", TypeName = "TEXT")]
    public string? Reason { get; set; }

    [Column("ip_address")]
    [StringLength(50)]
    public string? IpAddress { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    // Navigation properties
    [ForeignKey("TargetUserId")]
    public virtual User? TargetUser { get; set; }

    [ForeignKey("PerformedByUserId")]
    public virtual User? PerformedByUser { get; set; }
}