using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    /// <summary>
    /// DTO for Director Permission settings
    /// </summary>
    public class DirectorPermissionDto
    {
        public int DirectorPermissionId { get; set; }
        public int UserId { get; set; }
        public string? DirectorName { get; set; }
        public string? DirectorEmail { get; set; }

        // Dashboard & Analytics Permissions
        public bool CanViewWorkloadDashboard { get; set; } = true;
        public bool CanViewPerformanceMetrics { get; set; } = true;
        public bool CanViewAnalytics { get; set; } = true;
        public bool CanViewEngineerWorkload { get; set; } = true;

        // Task Management Permissions
        public bool CanManageCategories { get; set; } = true;
        public bool CanManagePriorities { get; set; } = true;
        public bool CanManageTaskTypes { get; set; } = true;

        // User Management Permissions
        public bool CanCreateTeamLeader { get; set; } = false;
        public bool CanCreateManager { get; set; } = true;
        public bool CanManageUsers { get; set; } = true;

        // Department & Shop Permissions
        public bool CanManageDepartments { get; set; } = true;
        public bool CanManageShops { get; set; } = true;

        // Report & Export Permissions
        public bool CanViewReports { get; set; } = true;
        public bool CanExportData { get; set; } = true;

        // Schedule & Planning Permissions
        public bool CanManageSchedules { get; set; } = true;

        // Approval & Follow-up Permissions
        public bool CanViewPendingTLApprovals { get; set; } = true;

        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// DTO for creating/updating Director permissions
    /// </summary>
    public class UpdateDirectorPermissionDto
    {
        [Required]
        public int UserId { get; set; }

        // Dashboard & Analytics Permissions
        public bool CanViewWorkloadDashboard { get; set; } = true;
        public bool CanViewPerformanceMetrics { get; set; } = true;
        public bool CanViewAnalytics { get; set; } = true;
        public bool CanViewEngineerWorkload { get; set; } = true;

        // Task Management Permissions
        public bool CanManageCategories { get; set; } = true;
        public bool CanManagePriorities { get; set; } = true;
        public bool CanManageTaskTypes { get; set; } = true;

        // User Management Permissions
        public bool CanCreateTeamLeader { get; set; } = false;
        public bool CanCreateManager { get; set; } = true;
        public bool CanManageUsers { get; set; } = true;

        // Department & Shop Permissions
        public bool CanManageDepartments { get; set; } = true;
        public bool CanManageShops { get; set; } = true;

        // Report & Export Permissions
        public bool CanViewReports { get; set; } = true;
        public bool CanExportData { get; set; } = true;

        // Schedule & Planning Permissions
        public bool CanManageSchedules { get; set; } = true;

        // Approval & Follow-up Permissions
        public bool CanViewPendingTLApprovals { get; set; } = true;
    }

    /// <summary>
    /// Enhanced Director Summary with permission details
    /// </summary>
    public class DirectorWithPermissionsDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int DepartmentCount { get; set; }
        public int ManagerCount { get; set; }
        public int TotalTeamMembers { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        
        // Permission details
        public DirectorPermissionDto? Permissions { get; set; }
    }
}