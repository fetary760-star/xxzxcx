using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    /// <summary>
    /// DTO for Team Leader Permission settings (read response).
    /// Field names use camelCase-friendly naming that matches the frontend expectations.
    /// </summary>
    public class TlPermissionDto
    {
        public int TlPermissionId { get; set; }
        public int UserId { get; set; }
        public string? TeamLeaderName { get; set; }
        public string? TeamLeaderEmail { get; set; }

        // Dashboard & Analytics Permissions
        public bool CanViewPerformanceMetrics { get; set; } = true;
        public bool CanViewEngineerWorkload { get; set; } = true;
        public bool CanViewAnalytics { get; set; } = true;
        public bool CanManageData { get; set; } = true;

        // Granular per-card metric visibility
        public bool CanViewCompletionRate { get; set; } = true;
        public bool CanViewAvgDelay { get; set; } = true;
        public bool CanViewTasksCompleted { get; set; } = true;
        public bool CanViewPendingTasks { get; set; } = true;

        // Task Management Permissions
        public bool CanManageCategories { get; set; } = true;
        public bool CanManagePriorities { get; set; } = true;
        public bool CanManageTaskTypes { get; set; } = true;

        // User Management Permissions
        public bool CanCreateTeamLeaders { get; set; } = true;
        public bool CanCreateManagers { get; set; } = true;
        public bool CanManageUsers { get; set; } = true;

        // Report & Export Permissions
        public bool CanViewReports { get; set; } = true;
        public bool CanExportData { get; set; } = true;

        // Schedule & Planning Permissions
        public bool CanManageSchedules { get; set; } = true;

        // Workload & Task Creation Permissions
        public bool CanWorkloadAdjustment { get; set; } = true;
        public bool CanCreateTask { get; set; } = true;

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// DTO for creating/updating Team Leader permissions (write request).
    /// </summary>
    public class UpdateTlPermissionDto
    {
        [Required]
        public int UserId { get; set; }

        // Dashboard & Analytics Permissions
        public bool CanViewPerformanceMetrics { get; set; } = true;
        public bool CanViewEngineerWorkload { get; set; } = true;
        public bool CanViewAnalytics { get; set; } = true;
        public bool CanManageData { get; set; } = true;

        // Granular per-card metric visibility
        public bool CanViewCompletionRate { get; set; } = true;
        public bool CanViewAvgDelay { get; set; } = true;
        public bool CanViewTasksCompleted { get; set; } = true;
        public bool CanViewPendingTasks { get; set; } = true;

        // Task Management Permissions
        public bool CanManageCategories { get; set; } = true;
        public bool CanManagePriorities { get; set; } = true;
        public bool CanManageTaskTypes { get; set; } = true;

        // User Management Permissions
        public bool CanCreateTeamLeaders { get; set; } = true;
        public bool CanCreateManagers { get; set; } = true;
        public bool CanManageUsers { get; set; } = true;

        // Report & Export Permissions
        public bool CanViewReports { get; set; } = true;
        public bool CanExportData { get; set; } = true;

        // Schedule & Planning Permissions
        public bool CanManageSchedules { get; set; } = true;

        // Workload & Task Creation Permissions
        public bool CanWorkloadAdjustment { get; set; } = true;
        public bool CanCreateTask { get; set; } = true;
    }

    /// <summary>
    /// Enhanced Team Leader summary with permission details (for listing all TLs).
    /// </summary>
    public class TeamLeaderWithPermissionsDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? ShopName { get; set; }
        public int EngineersCount { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }

        // Permission details
        public TlPermissionDto? Permissions { get; set; }
    }
}