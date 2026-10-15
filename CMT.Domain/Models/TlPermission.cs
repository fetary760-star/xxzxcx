using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

/// <summary>
/// Granular permissions for Team Leader role.
/// Allows Admin/Director to control which features each Team Leader can access.
/// Mirrors the DirectorPermission model but for TeamLeader users.
/// </summary>
[Table("tl_permissions")]
public class TlPermission : BaseEntity
{
    [Key]
    [Column("tl_permission_id")]
    public int TlPermissionId { get; set; }

    [Required]
    [Column("user_id")]
    public int UserId { get; set; }

    // Dashboard & Analytics Permissions
    [Column("can_view_performance_metrics")]
    public bool CanViewPerformanceMetrics { get; set; } = true;

    [Column("can_view_engineer_workload")]
    public bool CanViewEngineerWorkload { get; set; } = true;

    [Column("can_view_analytics")]
    public bool CanViewAnalytics { get; set; } = true;

    [Column("can_manage_data")]
    public bool CanManageData { get; set; } = true;

    // Granular per-card metric visibility
    [Column("can_view_completion_rate")]
    public bool CanViewCompletionRate { get; set; } = true;

    [Column("can_view_avg_delay")]
    public bool CanViewAvgDelay { get; set; } = true;

    [Column("can_view_tasks_completed")]
    public bool CanViewTasksCompleted { get; set; } = true;

    [Column("can_view_pending_tasks")]
    public bool CanViewPendingTasks { get; set; } = true;

    // Task Management Permissions
    [Column("can_manage_categories")]
    public bool CanManageCategories { get; set; } = true;

    [Column("can_manage_priorities")]
    public bool CanManagePriorities { get; set; } = true;

    [Column("can_manage_task_types")]
    public bool CanManageTaskTypes { get; set; } = true;

    // User Management Permissions
    [Column("can_create_team_leaders")]
    public bool CanCreateTeamLeaders { get; set; } = true;

    [Column("can_create_managers")]
    public bool CanCreateManagers { get; set; } = true;

    [Column("can_manage_users")]
    public bool CanManageUsers { get; set; } = true;

    // Report & Export Permissions
    [Column("can_view_reports")]
    public bool CanViewReports { get; set; } = true;

    [Column("can_export_data")]
    public bool CanExportData { get; set; } = true;

    // Schedule & Planning Permissions
    [Column("can_manage_schedules")]
    public bool CanManageSchedules { get; set; } = true;

    // Workload & Task Creation Permissions (Director-controlled for TL)
    [Column("can_workload_adjustment")]
    public bool CanWorkloadAdjustment { get; set; } = true;

    [Column("can_create_task")]
    public bool CanCreateTask { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation property
    [ForeignKey("UserId")]
    public virtual User User { get; set; } = null!;
}