using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public class DepartmentDto
    {
        public int DepartmentId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int DirectorId { get; set; }
        public string DirectorName { get; set; } = string.Empty;
        
        // UPDATED: Added for backward compatibility
        public int? ManagerId { get; set; }
        public string? ManagerName { get; set; }
        
        // UPDATED: Changed from single manager to list of managers
        public List<ManagerSummaryDto> Managers { get; set; } = new List<ManagerSummaryDto>();
        
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        
        // Statistics
        public int TotalUsers { get; set; }
        public int TotalShopTeamLeaders { get; set; }
        public int TotalTeamLeaders { get; set; }
        public int TotalEngineers { get; set; }
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
    }

    // UPDATED: DTO for manager summary with extended properties
    public class ManagerSummaryDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        
        // Extended properties for detailed manager information
        public int ManagedShopTeamLeaders { get; set; }
        public int TotalManagedUsers { get; set; }
        public int ActiveTasks { get; set; }
        public int CompletedTasks { get; set; }
        public double CompletionRate { get; set; }
    }

    // NEW: Department summary for Director dashboard
    public class DepartmentSummaryDto
    {
        public int DepartmentId { get; set; }
        public string DepartmentName { get; set; } = string.Empty;
        public string? Description { get; set; }
        public List<ManagerSummaryDto> Managers { get; set; } = new List<ManagerSummaryDto>();
        public int TotalManagers { get; set; }
        public int TotalUsers { get; set; }
        public int TotalShopTeamLeaders { get; set; }
        public int TotalTeamLeaders { get; set; }
        public int TotalEngineers { get; set; }
        public int ActiveTasks { get; set; }
        public int CompletedTasks { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CreateDepartmentDto
    {
        [Required(ErrorMessage = "Department name is required")]
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Department name must be between 2 and 100 characters")]
        public string Name { get; set; } = string.Empty;

        [StringLength(500, ErrorMessage = "Description cannot exceed 500 characters")]
        public string? Description { get; set; }

        // UPDATED: Optional list of manager IDs to assign during creation
        public List<int>? ManagerIds { get; set; }
    }

    public class UpdateDepartmentDto
    {
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Department name must be between 2 and 100 characters")]
        public string? Name { get; set; }

        [StringLength(500, ErrorMessage = "Description cannot exceed 500 characters")]
        public string? Description { get; set; }

        // UPDATED: Optional list of manager IDs to update
        public List<int>? ManagerIds { get; set; }
        
        public bool? IsActive { get; set; }
    }

    public class DirectorDashboardDto
    {
        public int DirectorUserId { get; set; }
        public string DirectorName { get; set; } = string.Empty;
        
        // All departments under this director
        public List<DepartmentSummaryDto> Departments { get; set; } = new List<DepartmentSummaryDto>();
        public int TotalDepartments { get; set; }
        
        // Aggregated statistics across all departments
        public int TotalManagers { get; set; }
        public int TotalShopTeamLeaders { get; set; }
        public int TotalTeamLeaders { get; set; }
        public int TotalEngineers { get; set; }
        public int TotalUsers { get; set; }
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalPendingTasks { get; set; }
        public double OverallCompletionRate { get; set; }
        
        // NEW: Team Leaders created by this Director (for direct visibility)
        public List<TeamLeaderDetailDto> TeamLeaders { get; set; } = new List<TeamLeaderDetailDto>();
        
        // Recent activity across all departments
        public List<TaskSummaryDto> RecentTasks { get; set; } = new List<TaskSummaryDto>();
    }

    /// <summary>
    /// NEW: Detailed DTO for Team Leaders created by Director
    /// Shows Team Leader information with their Engineers and task metrics
    /// </summary>
    public class TeamLeaderDetailDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        
        // Department assignment (may be null if not assigned)
        public int? DepartmentId { get; set; }
        public string? DepartmentName { get; set; }
        
        // Shop assignment (if applicable)
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        
        // Who created this Team Leader
        public int? CreatedByUserId { get; set; }
        public string? CreatedByUserName { get; set; }
        
        // Engineers managed by this Team Leader
        public List<EngineerSummaryDto> Engineers { get; set; } = new List<EngineerSummaryDto>();
        public int TotalEngineers { get; set; }
        
        // Task metrics for this Team Leader and their Engineers
        public int ActiveTasks { get; set; }
        public int CompletedTasks { get; set; }
        public int PendingTasks { get; set; }
        public double CompletionRate { get; set; }
        
        // Workload metrics
        public int TotalTasksAssigned { get; set; }
        public double AverageDelayDays { get; set; }
        
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    /// <summary>
    /// NEW: Summary DTO for Engineers under a Team Leader
    /// </summary>
    public class EngineerSummaryDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        
        // Task metrics
        public int ActiveTasks { get; set; }
        public int CompletedTasks { get; set; }
        public int PendingTasks { get; set; }
        public double CompletionRate { get; set; }
        
        // Workload
        public int CurrentWorkload { get; set; }
        
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class DepartmentWithHierarchyDto
    {
        public int DepartmentId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public bool IsActive { get; set; }
        
        // UPDATED: Multiple managers instead of single manager
        public List<ManagerSummaryDto> Managers { get; set; } = new List<ManagerSummaryDto>();
        
        // Shop Team Leaders in this department
        public List<ShopTeamLeaderWithTeamDto> ShopTeamLeaders { get; set; } = new List<ShopTeamLeaderWithTeamDto>();
        
        // Team Leaders in this department
        public List<UserDto> TeamLeaders { get; set; } = new List<UserDto>();
        
        // Engineers in this department
        public List<UserDto> Engineers { get; set; } = new List<UserDto>();
        
        // Department statistics
        public int TotalUsers { get; set; }
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalPendingTasks { get; set; }
        public double CompletionRate { get; set; }
    }

    public class ShopTeamLeaderWithTeamDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        
        // Personnel created by this Shop Team Leader
        public List<UserDto> TeamMembers { get; set; } = new List<UserDto>();
        public int TotalTeamMembers { get; set; }
        
        // Task metrics
        public int CompletedTasks { get; set; }
        public int ActiveTasks { get; set; }
        public int PendingTasks { get; set; }
        public double CompletionRate { get; set; }
    }
}