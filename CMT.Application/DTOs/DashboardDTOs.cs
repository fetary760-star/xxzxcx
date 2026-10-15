using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public class DashboardMetricsDto
    {
        public int TotalTasks { get; set; }
        public int TasksCompleted { get; set; }
        public int PendingTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int OverdueTasks { get; set; }
        public int OnHoldTasks { get; set; } // NEW: Separate count for OnHold tasks
        public double CompletionRate { get; set; }
        public double AvgDelayDays { get; set; }
        public string AvgDelayFormatted => $"{AvgDelayDays:F2} days";
        public string CompletionRateFormatted => $"{CompletionRate:F2}%";
        public List<RecentTaskDto> RecentTasks { get; set; } = new List<RecentTaskDto>();
        public Dictionary<string, int> TaskStatusBreakdown { get; set; } = new Dictionary<string, int>();
        public List<OnHoldTaskDetailDto> OnHoldTaskDetails { get; set; } = new List<OnHoldTaskDetailDto>(); // NEW: Details of OnHold tasks
        
        // Role-based scope information
        public string UserRole { get; set; } = string.Empty;
        public int? UserShopId { get; set; }
        public string? UserShopName { get; set; }
        public bool IsRoleBasedView { get; set; }
    }

    public class RecentTaskDto
    {
        public int TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string CreatedByName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string? CategoryName { get; set; }
        public string? PriorityName { get; set; }
        public bool IsCompleted { get; set; }
        public DateTime? OnHoldDate { get; set; } // NEW: Date when task was put on hold
        public int? DaysWorkedBeforeHold { get; set; } // NEW: Days worked before hold
    }

    // NEW: DTO for OnHold task details
    public class OnHoldTaskDetailDto
    {
        public int TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public string AssignedEngineer { get; set; } = string.Empty;
        public DateTime OnHoldDate { get; set; }
        public int DaysWorkedBeforeHold { get; set; }
        public string HoldReason { get; set; } = string.Empty;
        public string HoldStatus { get; set; } = string.Empty; // PendingApproval, Approved, Rejected
        public DateTime? ReviewDate { get; set; }
        public string? ReviewedByName { get; set; }
        public string? ActionTaken { get; set; }
    }

    public class UserPerformanceMetricsDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
        public int TotalTasks { get; set; }
        public int TasksCompleted { get; set; }
        public int PendingTasks { get; set; }
        public int OverdueTasks { get; set; }
        public int OnHoldTasks { get; set; } // NEW: OnHold tasks count
        public double CompletionRate { get; set; }
        public double AvgDelayDays { get; set; }
        public string CompletionRateFormatted => $"{CompletionRate:F2}%";
        public string AvgDelayFormatted => $"{AvgDelayDays:F2} days";
        public DateTime LastTaskCreated { get; set; }
        public DateTime? LastTaskCompleted { get; set; }
        public int TotalDaysWorkedOnHoldTasks { get; set; } // NEW: Total days worked on tasks that went on hold
        public int TransferredDaysFromEngineers { get; set; } // NEW: Days transferred from engineers (for Team Leaders)
    }

    public class ShopPerformanceMetricsDto
    {
        public int ShopId { get; set; }
        public string ShopName { get; set; } = string.Empty;
        public int TotalTasks { get; set; }
        public int TasksCompleted { get; set; }
        public int PendingTasks { get; set; }
        public int OverdueTasks { get; set; }
        public int OnHoldTasks { get; set; } // NEW: OnHold tasks count
        public double CompletionRate { get; set; }
        public double AvgDelayDays { get; set; }
        public string CompletionRateFormatted => $"{CompletionRate:F2}%";
        public string AvgDelayFormatted => $"{AvgDelayDays:F2} days";
        public int ActiveUsers { get; set; }
        public List<UserPerformanceMetricsDto> TopPerformers { get; set; } = new List<UserPerformanceMetricsDto>();
    }
}