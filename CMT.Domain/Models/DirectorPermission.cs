using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

/// <summary>
/// Granular permissions for Director role
/// Allows Admin to control which features each Director can access
/// </summary>
[Table("director_permissions")]
public class DirectorPermission : BaseEntity
{
    [Key]
    [Column("director_permission_id")]
    public int DirectorPermissionId { get; set; }

    [Required]
    [Column("user_id")]
    public int UserId { get; set; }

    // Dashboard & Analytics Permissions
    [Column("can_view_workload_dashboard")]
    public bool CanViewWorkloadDashboard { get; set; } = true;

    [Column("can_view_performance_metrics")]
    public bool CanViewPerformanceMetrics { get; set; } = true;

    [Column("can_view_analytics")]
    public bool CanViewAnalytics { get; set; } = true;

    [Column("can_view_engineer_workload")]
    public bool CanViewEngineerWorkload { get; set; } = true;

    // Task Management Permissions
    [Column("can_manage_categories")]
    public bool CanManageCategories { get; set; } = true;

    [Column("can_manage_priorities")]
    public bool CanManagePriorities { get; set; } = true;

    [Column("can_manage_task_types")]
    public bool CanManageTaskTypes { get; set; } = true;

    // User Management Permissions
    [Column("can_create_team_leader")]
    public bool CanCreateTeamLeader { get; set; } = false;

    [Column("can_create_manager")]
    public bool CanCreateManager { get; set; } = true;

    [Column("can_manage_users")]
    public bool CanManageUsers { get; set; } = true;

    // Department & Shop Permissions
    [Column("can_manage_departments")]
    public bool CanManageDepartments { get; set; } = true;

    [Column("can_manage_shops")]
    public bool CanManageShops { get; set; } = true;

    // Report & Export Permissions
    [Column("can_view_reports")]
    public bool CanViewReports { get; set; } = true;

    [Column("can_export_data")]
    public bool CanExportData { get; set; } = true;

    // Schedule & Planning Permissions
    [Column("can_manage_schedules")]
    public bool CanManageSchedules { get; set; } = true;

    // Approval & Follow-up Permissions
    [Column("can_view_pending_tl_approvals")]
    public bool CanViewPendingTLApprovals { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    [ForeignKey("UserId")]
    public virtual User User { get; set; } = null!;
}