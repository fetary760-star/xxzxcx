using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

/// <summary>
/// Stores the role-based permission matrix server-side.
/// Each row represents one (role, permission) combination.
/// This replaces the previous localStorage-only approach so that
/// permissions assigned by Admin on any PC/browser are visible everywhere.
/// </summary>
[Table("role_permissions")]
public class RolePermission
{
    [Key]
    [Column("role_permission_id")]
    public int RolePermissionId { get; set; }

    /// <summary>
    /// The role key, e.g. "team_leader", "manager", "shop_tl", "engineer",
    /// "customer_personnel", "customer".
    /// </summary>
    [Required]
    [MaxLength(50)]
    [Column("role_key")]
    public string RoleKey { get; set; } = string.Empty;

    /// <summary>
    /// The permission key, e.g. "delete_task", "delete_user", "reopen_task",
    /// "view_performance_metrics", "view_engineer_workload", "view_analytics",
    /// "mantenix_data", "transfers", "edit_user", "workload_adjustment", "create_task",
    /// "request_amendment".
    /// </summary>
    [Required]
    [MaxLength(50)]
    [Column("permission_key")]
    public string PermissionKey { get; set; } = string.Empty;

    /// <summary>
    /// Whether this role has this permission granted.
    /// </summary>
    [Column("is_granted")]
    public bool IsGranted { get; set; } = false;

    [Column("updated_by_user_id")]
    public int? UpdatedByUserId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}