namespace CMT.Application.DTOs
{
    // Completion Rate Analytics
    public class CompletionRateAnalyticsDto
    {
        public int TotalTasks { get; set; }
        public int CompletedTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int PendingTasks { get; set; }
        public int BlockedTasks { get; set; }
        public int OnHoldTasks { get; set; }
        public int PausedTasks { get; set; }
        public int RejectedTasks { get; set; }
        public int CancelledTasks { get; set; }
        public int PendingTLApprovalTasks { get; set; }
        public double CompletionRate { get; set; }
        public Dictionary<string, int> StatusBreakdown { get; set; } = new();
        public Dictionary<string, CategoryDistributionDto> CategoryDistribution { get; set; } = new();
        public List<CompletionTrendItemDto> CompletionTrend { get; set; } = new();
    }

    public class CategoryDistributionDto
    {
        public string CategoryName { get; set; } = string.Empty;
        public int TotalTasks { get; set; }
        public int CompletedTasks { get; set; }
        public double CompletionRate { get; set; }
        public Dictionary<string, int> EngineerDistribution { get; set; } = new();
    }

    public class CompletionTrendItemDto
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Engineer { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public int DelayDays { get; set; }
    }

    // Average Delay Analytics
    public class AvgDelayAnalyticsDto
    {
        public double AvgDelayDays { get; set; }
        public double AvgLateDelay { get; set; }
        public double AvgEarlyDelivery { get; set; }
        public int TotalAnalyzed { get; set; }
        public int OnTime { get; set; }
        public int Early { get; set; }
        public int Late { get; set; }
        public string OnTimePercentage { get; set; } = "0";
        public string EarlyPercentage { get; set; } = "0";
        public string LatePercentage { get; set; } = "0";
        public List<DelayAnalysisItemDto> DelayBreakdown { get; set; } = new();
    }

    public class DelayAnalysisItemDto
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int DelayDays { get; set; }
        public string Status { get; set; } = string.Empty;
        public string ActualDate { get; set; } = string.Empty;
        public string TargetDate { get; set; } = string.Empty;
        public string Engineer { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
    }

    // Tasks Completed Analytics
    public class TasksCompletedAnalyticsDto
    {
        public int TotalCompleted { get; set; }
        public Dictionary<string, int> ByPriority { get; set; } = new();
        public Dictionary<string, int> ByEngineer { get; set; } = new();
        public Dictionary<string, PriorityStatsDto> PriorityStats { get; set; } = new();
        public List<RecentCompletionItemDto> RecentCompletions { get; set; } = new();
    }

    public class PriorityStatsDto
    {
        public int Completed { get; set; }
        public int Total { get; set; }
        public double Rate { get; set; }
    }

    public class RecentCompletionItemDto
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Engineer { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public string CompletedDate { get; set; } = string.Empty;
        public string CreatedDate { get; set; } = string.Empty;
    }

    // Pending Tasks Analytics
    public class PendingTasksAnalyticsDto
    {
        public int TotalPending { get; set; }
        public int Overdue { get; set; }
        public Dictionary<string, int> ByStatus { get; set; } = new();
        public Dictionary<string, int> ByPriority { get; set; } = new();
        public Dictionary<string, int> ByEngineer { get; set; } = new();
        public List<PendingTaskDetailDto> PendingTasks { get; set; } = new();
    }

    public class PendingTaskDetailDto
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public string Engineer { get; set; } = string.Empty;
        public string? TargetDate { get; set; }
        public string CreatedAt { get; set; } = string.Empty;
        public bool IsOverdue { get; set; }
    }
}