namespace CMT.Application.DTOs
{
    public class EngineerWorkloadDto
    {
        public int EngineerId { get; set; }
        public string EngineerName { get; set; } = string.Empty;
        public string ShopName { get; set; } = string.Empty;
        public int OpenCount { get; set; }
        public int InProgressCount { get; set; }
        public int OnHoldCount { get; set; }
        public int BlockedCount { get; set; }
        public int RejectedCount { get; set; }
        public int PausedCount { get; set; }
        public int PendingTLApprovalCount { get; set; }
        public int CancelledCount { get; set; }
        public int CompletedCount { get; set; }
        public int HandledCount { get; set; }
        public int ActiveCount { get; set; }
        public int Capacity { get; set; } = 12;
        public decimal WorkloadPercentage { get; set; }
        public decimal TotalEstimatedHours { get; set; }
        public decimal CompletedEstimatedHours { get; set; }
        public List<TaskBreakdownDto> TaskBreakdown { get; set; } = new();
        public List<CompletedTaskBreakdownDto> CompletedTaskBreakdown { get; set; } = new();
        public WorkloadMetricsDto Metrics { get; set; } = new();
    }

    public class TaskBreakdownDto
{
    public int TaskId { get; set; }
    public string SerialNumber { get; set; } = string.Empty;
    public string PartNumber { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal EstimatedHours { get; set; }
    public DateTime? EstimatedCompletionDate { get; set; }
    public DateTime? TargetCompletionDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsOverdue { get; set; }
    public int DaysRemaining { get; set; }

    // Additional properties for Performance Service compatibility
    public string? CategoryName { get; set; }
    public string? PriorityName { get; set; }
    public DateTime? ActualCompletionDate { get; set; }
    public int? DelayDays { get; set; }
    public bool IsOnTime { get; set; }

    // ===== ADDED — required by performance/page.tsx's rate pipeline =====
    // Without these 4 fields the frontend cannot resolve the real
    // "Task Assigned At" / "Engineer Completed At" baseline and silently
    // falls back to TaskCreatedAt, which alone explains most of the
    // Early/Delay/Efficiency mismatch against the Completed Tasks view.

    /// <summary>Category id, used by getTargetDaysValue() to look up Category Target Days.</summary>
    public int? CategoryId { get; set; }

    /// <summary>THE duration baseline — must be Task Assigned At, not Task Created At.</summary>
    public DateTime? TaskAssignedAt { get; set; }

    /// <summary>THE actual completion timestamp used by resolveActualCompletion().</summary>
    public DateTime? EngineerCompletedAt { get; set; }

    /// <summary>Fallback actual-completion timestamp (TL approval / moved-to-completed instant).</summary>
    public DateTime? TlApprovalDate { get; set; }
}

    public class CompletedTaskBreakdownDto
    {
        public int CompletedTaskId { get; set; }
        public int OriginalTaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public DateTime CompletedAt { get; set; }
        public DateTime? ActualCompletionDate { get; set; }
        public DateTime? TargetCompletionDate { get; set; }
        public bool WasOnTime { get; set; }
        public int CompletionDays { get; set; }
        public bool HasAmendmentRequest { get; set; }
        public string? AmendmentStatus { get; set; }
    }

    public class WorkloadMetricsDto
    {
        public decimal AverageTaskCompletionDays { get; set; }
        public decimal OnTimeCompletionRate { get; set; }
        public int OverdueTasks { get; set; }
        public int UpcomingDeadlines { get; set; } // Tasks due within 3 days
        public decimal UtilizationRate { get; set; }
        public string PerformanceRating { get; set; } = "Good";
    }

    public class WorkloadSummaryDto
    {
        public int TotalEngineers { get; set; }
        public decimal AverageWorkload { get; set; }
        public int TotalTasks { get; set; }
        public int TotalCompleted { get; set; }
        public int TotalPending { get; set; }
        public int TotalInProgress { get; set; }
        public int TotalOnHold { get; set; }
        public int TotalBlocked { get; set; }
        public int TotalRejected { get; set; }
        public decimal TotalEstimatedHours { get; set; }
        public decimal AverageTasksPerEngineer { get; set; }
        public string MostLoadedEngineer { get; set; } = string.Empty;
        public string LeastLoadedEngineer { get; set; } = string.Empty;
        public List<ShopWorkloadSummaryDto> ShopBreakdown { get; set; } = new();
    }

    public class ShopWorkloadSummaryDto
    {
        public string ShopName { get; set; } = string.Empty;
        public int EngineerCount { get; set; }
        public int TotalTasks { get; set; }
        public int CompletedTasks { get; set; }
        public decimal AverageWorkload { get; set; }
        public decimal TotalEstimatedHours { get; set; }
    }

    public class WorkloadTrendDto
    {
        public DateTime Date { get; set; }
        public int EngineerId { get; set; }
        public string EngineerName { get; set; } = string.Empty;
        public int TaskCount { get; set; }
        public decimal WorkloadPercentage { get; set; }
        public int CompletedCount { get; set; }
        public int NewTasksCount { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────
    // NEW DTOs for Accessible Engineer Workload (View Engineer Workload permission)
    // ─────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Distribution of tasks by category for accessible engineers.
    /// Used in the descriptive graph to show which task categories are assigned.
    /// </summary>
    public class CategoryTaskDistributionDto
    {
        public string CategoryName { get; set; } = string.Empty;
        public int ActiveCount { get; set; }
        public int CompletedCount { get; set; }
        public int TotalCount { get; set; }
        public int OverdueCount { get; set; }
        public int UrgentCount { get; set; } // Tasks due within 3 days
    }

    /// <summary>
    /// Urgency breakdown of tasks for accessible engineers.
    /// Prioritized by target date proximity to facilitate easier task handling.
    /// </summary>
    public class UrgencyBreakdownDto
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string AssignedEngineer { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public DateTime? TargetCompletionDate { get; set; }
        public int DaysRemaining { get; set; }
        public bool IsOverdue { get; set; }
        /// <summary>
        /// Urgency level: "Overdue", "Critical" (0-1 days), "High" (2-3 days), "Medium" (4-7 days), "Low" (>7 days)
        /// </summary>
        public string UrgencyLevel { get; set; } = "Low";
        public decimal EstimatedHours { get; set; }
    }

    /// <summary>
    /// Status distribution across all accessible engineers.
    /// Shows how many tasks are in each status for the filtered set of engineers.
    /// </summary>
    public class StatusDistributionDto
    {
        public string StatusName { get; set; } = string.Empty;
        public int Count { get; set; }
        public decimal Percentage { get; set; }
    }

    /// <summary>
    /// Per-engineer summary within the accessible workload view.
    /// Provides a compact view of each engineer's task distribution by category.
    /// </summary>
    public class EngineerCategorySummaryDto
    {
        public int EngineerId { get; set; }
        public string EngineerName { get; set; } = string.Empty;
        public int ActiveCount { get; set; }
        public int CompletedCount { get; set; }
        public int TotalAssigned { get; set; }
        public decimal WorkloadPercentage { get; set; }
        public string PerformanceRating { get; set; } = "Good";
        public List<CategoryTaskDistributionDto> CategoryBreakdown { get; set; } = new();
        public int OverdueCount { get; set; }
        public int UrgentCount { get; set; }
    }

    /// <summary>
    /// Enhanced workload summary for accessible engineers only.
    /// Replaces the generic "Total Engineers" view with a descriptive, filtered view
    /// based on engineers who have been granted "View Engineer Workload" access.
    /// </summary>
    public class AccessibleEngineerWorkloadSummaryDto
    {
        /// <summary>
        /// Descriptive label for the accessible engineers group (e.g., "Granted Engineers" or custom label).
        /// Replaces the generic "Total" label.
        /// </summary>
        public string GroupLabel { get; set; } = "Accessible Engineers";

        /// <summary>
        /// Number of engineers with granted access.
        /// </summary>
        public int AccessibleEngineerCount { get; set; }

        /// <summary>
        /// Names of engineers with granted access.
        /// </summary>
        public List<string> AccessibleEngineerNames { get; set; } = new();

        /// <summary>
        /// Per-engineer category summaries for the accessible engineers.
        /// </summary>
        public List<EngineerCategorySummaryDto> EngineerSummaries { get; set; } = new();

        /// <summary>
        /// Aggregated task distribution by category across all accessible engineers.
        /// </summary>
        public List<CategoryTaskDistributionDto> CategoryDistribution { get; set; } = new();

        /// <summary>
        /// Aggregated status distribution across all accessible engineers.
        /// </summary>
        public List<StatusDistributionDto> StatusDistribution { get; set; } = new();

        /// <summary>
        /// Tasks prioritized by urgency (target date proximity) across all accessible engineers.
        /// Sorted by urgency level descending (Overdue first, then Critical, High, Medium, Low).
        /// </summary>
        public List<UrgencyBreakdownDto> UrgencyPrioritizedTasks { get; set; } = new();

        /// <summary>
        /// Full workload data for each accessible engineer (preserves existing detail view).
        /// </summary>
        public List<EngineerWorkloadDto> EngineerWorkloads { get; set; } = new();

        // Aggregate totals
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalAssignedTasks { get; set; }
        public int TotalOverdueTasks { get; set; }
        public int TotalUrgentTasks { get; set; }
        public decimal AverageWorkloadPercentage { get; set; }
    }
}