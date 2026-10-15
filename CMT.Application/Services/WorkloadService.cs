using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskEntity = CMT.Domain.Models.Task;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using DomainUserRole = CMT.Domain.Models.UserRole;

namespace CMT.Application.Services
{
    public class WorkloadService : IWorkloadService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<WorkloadService> _logger;

        // FIX (Issue 2 & 10): Configurable constants aligned with EAT schedule
        // ScheduleService.cs: Shift 08:00–17:00, Breaks 15+75+15=105min, Net 7.25h/day
        private const decimal NetWorkHoursPerDay = 7.25m; // EAT schedule: (540 - 105) / 60
        private const decimal NetWorkHoursPerWeek = 36.25m; // 7.25 * 5

        public WorkloadService(ApplicationDbContext context, ILogger<WorkloadService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async System.Threading.Tasks.Task<IEnumerable<EngineerWorkloadDto>> GetEngineerWorkloadAsync()
        {
            try
            {
                _logger.LogInformation("🔍 WorkloadService - Starting GetEngineerWorkloadAsync with enhanced completed task breakdown");

                // FIXED: Query Tasks table — this is the single source of truth (same as PerformanceService)
                // NOTE: No longer filtering out Rejected tasks — they are included in workload data
                // so the frontend can display accurate rejectedCount in the Detailed Breakdown
                var allTasks = await _context.Tasks
                    .Include(t => t.Priority)
                    .Include(t => t.Category)
                    .Where(t => t.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                // FIXED: Also query CompletedTasks table for detailed breakdown info (completedAt, etc.)
                var completedTasksTable = await _context.CompletedTasks
                    .Include(ct => ct.Priority)
                    .Include(ct => ct.Category)
                    .Where(ct => ct.RecordStatus == RecordStatus.Active && ct.Status == DomainTaskStatus.Completed)
                    .ToListAsync();

                _logger.LogInformation("📊 WorkloadService - Found {AllTasksCount} tasks in Tasks table and {CompletedTableCount} in CompletedTasks table", 
                    allTasks.Count, completedTasksTable.Count);

                // FIXED (Completed Count Alignment): Properly split comma-separated AssignedEngineer values
                // into individual engineer names. Previously the raw string (e.g. "Alice, Bob") was used as
                // a single "engineer key", and then Contains() matched tasks with the substring — which
                // caused:
                //   (a) tasks shared between multiple engineers to be counted against a combined
                //       "Alice, Bob" pseudo-engineer instead of each individual engineer, and
                //   (b) substring collisions (e.g. engineer "John" matching "Johnson" or "John, Mike")
                //       inflating the count for the shorter-named engineer.
                // The fix below extracts individual, trimmed, case-insensitively-distinct engineer names.
                var allEngineerNames = allTasks
                    .Where(t => !string.IsNullOrEmpty(t.AssignedEngineer))
                    .SelectMany(t => SplitEngineerNames(t.AssignedEngineer!))
                    .Concat(completedTasksTable
                        .Where(ct => !string.IsNullOrEmpty(ct.AssignedEngineer))
                        .SelectMany(ct => SplitEngineerNames(ct.AssignedEngineer!)))
                    .GroupBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Select(g => g.First())
                    .ToList();

                _logger.LogInformation("👥 WorkloadService - Found {EngineerCount} unique engineers", allEngineerNames.Count);

                // FIXED: Build workload data using Tasks table as single source of truth
                // This matches PerformanceService approach: all counts derived from Tasks table
                var workloadByEngineer = allEngineerNames.Select(engineerName =>
                {
                    return BuildEngineerWorkloadDto(engineerName, allTasks, completedTasksTable);
                })
                .OrderByDescending(w => w.ActiveCount)
                .ToList();

                _logger.LogInformation("✅ WorkloadService - Generated workload for {Count} engineers with completed task breakdowns", workloadByEngineer.Count);

                // Log completed task breakdown counts for debugging
                foreach (var workload in workloadByEngineer)
                {
                    _logger.LogInformation("Engineer {EngineerName}: {CompletedCount} completed tasks in breakdown", 
                        workload.EngineerName, workload.CompletedTaskBreakdown.Count);
                }

                // Try to match engineer names with user IDs
                var users = await _context.Users
                    .Where(u => u.Role == DomainUserRole.Engineer && u.Status == UserStatus.Active)
                    .ToListAsync();

                foreach (var workload in workloadByEngineer)
                {
                    var user = users.FirstOrDefault(u => u.FullName == workload.EngineerName);
                    if (user != null)
                    {
                        workload.EngineerId = user.UserId;
                    }
                }

                return workloadByEngineer;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ WorkloadService - Error retrieving engineer workload");
                throw;
            }
        }

        /// <summary>
        /// NEW: Get workload data filtered to only the accessible (granted) engineers.
        /// Returns an enhanced summary with category distribution, status breakdown,
        /// and urgency-prioritized task lists for the descriptive graph.
        /// </summary>
        public async System.Threading.Tasks.Task<AccessibleEngineerWorkloadSummaryDto> GetAccessibleEngineerWorkloadAsync(List<string> accessibleEngineerNames)
        {
            try
            {
                _logger.LogInformation("🔍 WorkloadService - GetAccessibleEngineerWorkloadAsync for {Count} engineers: {Names}",
                    accessibleEngineerNames.Count, string.Join(", ", accessibleEngineerNames));

                // Get all workloads first
                var allWorkloads = (await GetEngineerWorkloadAsync()).ToList();

                // Filter to only accessible engineers (case-insensitive match)
                var accessibleNamesLower = accessibleEngineerNames
                    .Select(n => n.Trim().ToLowerInvariant())
                    .Where(n => !string.IsNullOrEmpty(n))
                    .ToHashSet();

                var filteredWorkloads = allWorkloads
                    .Where(w => accessibleNamesLower.Contains(w.EngineerName.Trim().ToLowerInvariant()))
                    .ToList();

                _logger.LogInformation("📊 WorkloadService - Filtered to {FilteredCount} accessible engineers out of {TotalCount}",
                    filteredWorkloads.Count, allWorkloads.Count);

                // Build category distribution across all accessible engineers
                var allActiveTaskBreakdowns = filteredWorkloads
                    .SelectMany(w => w.TaskBreakdown)
                    .ToList();

                var allCompletedTaskBreakdowns = filteredWorkloads
                    .SelectMany(w => w.CompletedTaskBreakdown)
                    .ToList();

                var categoryDistribution = allActiveTaskBreakdowns
                    .GroupBy(t => t.Category ?? "Unknown")
                    .Select(g => new CategoryTaskDistributionDto
                    {
                        CategoryName = g.Key,
                        ActiveCount = g.Count(),
                        CompletedCount = allCompletedTaskBreakdowns.Count(ct => (ct.Category ?? "Unknown") == g.Key),
                        TotalCount = g.Count() + allCompletedTaskBreakdowns.Count(ct => (ct.Category ?? "Unknown") == g.Key),
                        OverdueCount = g.Count(t => t.IsOverdue),
                        UrgentCount = g.Count(t => t.DaysRemaining >= 0 && t.DaysRemaining <= 3)
                    })
                    .OrderByDescending(c => c.ActiveCount)
                    .ToList();

                // Add categories that only exist in completed tasks
                var activeCategoryNames = categoryDistribution.Select(c => c.CategoryName).ToHashSet();
                var completedOnlyCategories = allCompletedTaskBreakdowns
                    .Where(ct => !activeCategoryNames.Contains(ct.Category ?? "Unknown"))
                    .GroupBy(ct => ct.Category ?? "Unknown")
                    .Select(g => new CategoryTaskDistributionDto
                    {
                        CategoryName = g.Key,
                        ActiveCount = 0,
                        CompletedCount = g.Count(),
                        TotalCount = g.Count(),
                        OverdueCount = 0,
                        UrgentCount = 0
                    })
                    .ToList();
                categoryDistribution.AddRange(completedOnlyCategories);

                // Build status distribution
                var statusCounts = new Dictionary<string, int>
                {
                    { "Pending", filteredWorkloads.Sum(w => w.OpenCount) },
                    { "In Progress", filteredWorkloads.Sum(w => w.InProgressCount) },
                    { "On Hold", filteredWorkloads.Sum(w => w.OnHoldCount) },
                    { "Blocked", filteredWorkloads.Sum(w => w.BlockedCount) },
                    { "Paused", filteredWorkloads.Sum(w => w.PausedCount) },
                    { "Pending TL Approval", filteredWorkloads.Sum(w => w.PendingTLApprovalCount) },
                    { "Rejected", filteredWorkloads.Sum(w => w.RejectedCount) },
                    { "Cancelled", filteredWorkloads.Sum(w => w.CancelledCount) },
                    { "Completed", filteredWorkloads.Sum(w => w.CompletedCount) }
                };

                var totalStatusCount = statusCounts.Values.Sum();
                var statusDistribution = statusCounts
                    .Where(kv => kv.Value > 0)
                    .Select(kv => new StatusDistributionDto
                    {
                        StatusName = kv.Key,
                        Count = kv.Value,
                        Percentage = totalStatusCount > 0 ? Math.Round((decimal)kv.Value / totalStatusCount * 100, 2) : 0
                    })
                    .OrderByDescending(s => s.Count)
                    .ToList();

                // Build urgency-prioritized task list from active tasks
                var urgencyTasks = allActiveTaskBreakdowns
                    .Select(t => new UrgencyBreakdownDto
                    {
                        TaskId = t.TaskId,
                        SerialNumber = t.SerialNumber,
                        Description = t.Description,
                        AssignedEngineer = filteredWorkloads
                            .FirstOrDefault(w => w.TaskBreakdown.Any(tb => tb.TaskId == t.TaskId))?.EngineerName ?? "Unknown",
                        Status = t.Status,
                        Priority = t.Priority,
                        Category = t.Category,
                        TargetCompletionDate = t.TargetCompletionDate ?? t.EstimatedCompletionDate,
                        DaysRemaining = t.DaysRemaining,
                        IsOverdue = t.IsOverdue,
                        UrgencyLevel = GetUrgencyLevel(t.DaysRemaining, t.IsOverdue),
                        EstimatedHours = t.EstimatedHours
                    })
                    .OrderBy(u => GetUrgencySortOrder(u.UrgencyLevel))
                    .ThenBy(u => u.DaysRemaining)
                    .ToList();

                // Build per-engineer category summaries
                var engineerSummaries = filteredWorkloads.Select(w =>
                {
                    var engCategoryBreakdown = w.TaskBreakdown
                        .GroupBy(t => t.Category ?? "Unknown")
                        .Select(g => new CategoryTaskDistributionDto
                        {
                            CategoryName = g.Key,
                            ActiveCount = g.Count(),
                            CompletedCount = w.CompletedTaskBreakdown.Count(ct => (ct.Category ?? "Unknown") == g.Key),
                            TotalCount = g.Count() + w.CompletedTaskBreakdown.Count(ct => (ct.Category ?? "Unknown") == g.Key),
                            OverdueCount = g.Count(t => t.IsOverdue),
                            UrgentCount = g.Count(t => t.DaysRemaining >= 0 && t.DaysRemaining <= 3)
                        })
                        .OrderByDescending(c => c.ActiveCount)
                        .ToList();

                    return new EngineerCategorySummaryDto
                    {
                        EngineerId = w.EngineerId,
                        EngineerName = w.EngineerName,
                        ActiveCount = w.ActiveCount,
                        CompletedCount = w.CompletedCount,
                        TotalAssigned = w.HandledCount,
                        WorkloadPercentage = w.WorkloadPercentage,
                        PerformanceRating = w.Metrics?.PerformanceRating ?? "Good",
                        CategoryBreakdown = engCategoryBreakdown,
                        OverdueCount = w.Metrics?.OverdueTasks ?? 0,
                        UrgentCount = w.Metrics?.UpcomingDeadlines ?? 0
                    };
                })
                .OrderByDescending(e => e.ActiveCount)
                .ToList();

                var totalActive = filteredWorkloads.Sum(w => w.ActiveCount);
                var totalCompleted = filteredWorkloads.Sum(w => w.CompletedCount);
                var totalAssigned = filteredWorkloads.Sum(w => w.HandledCount);
                var totalOverdue = urgencyTasks.Count(u => u.IsOverdue);
                var totalUrgent = urgencyTasks.Count(u => u.UrgencyLevel == "Critical" || u.UrgencyLevel == "High");

                var result = new AccessibleEngineerWorkloadSummaryDto
                {
                    GroupLabel = "Accessible Engineers",
                    AccessibleEngineerCount = filteredWorkloads.Count,
                    AccessibleEngineerNames = filteredWorkloads.Select(w => w.EngineerName).ToList(),
                    EngineerSummaries = engineerSummaries,
                    CategoryDistribution = categoryDistribution,
                    StatusDistribution = statusDistribution,
                    UrgencyPrioritizedTasks = urgencyTasks,
                    EngineerWorkloads = filteredWorkloads,
                    TotalActiveTasks = totalActive,
                    TotalCompletedTasks = totalCompleted,
                    TotalAssignedTasks = totalAssigned,
                    TotalOverdueTasks = totalOverdue,
                    TotalUrgentTasks = totalUrgent,
                    AverageWorkloadPercentage = filteredWorkloads.Any()
                        ? Math.Round(filteredWorkloads.Average(w => w.WorkloadPercentage), 2)
                        : 0
                };

                _logger.LogInformation("✅ WorkloadService - Accessible workload: {Count} engineers, {Active} active, {Completed} completed, {Overdue} overdue",
                    result.AccessibleEngineerCount, result.TotalActiveTasks, result.TotalCompletedTasks, result.TotalOverdueTasks);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ WorkloadService - Error retrieving accessible engineer workload");
                throw;
            }
        }

        /// <summary>
        /// Helper: Determine urgency level based on days remaining and overdue status.
        /// </summary>
        private static string GetUrgencyLevel(int daysRemaining, bool isOverdue)
        {
            if (isOverdue) return "Overdue";
            if (daysRemaining <= 1) return "Critical";
            if (daysRemaining <= 3) return "High";
            if (daysRemaining <= 7) return "Medium";
            return "Low";
        }

        /// <summary>
        /// Helper: Sort order for urgency levels (lower = more urgent = sorted first).
        /// </summary>
        private static int GetUrgencySortOrder(string urgencyLevel)
        {
            return urgencyLevel switch
            {
                "Overdue" => 0,
                "Critical" => 1,
                "High" => 2,
                "Medium" => 3,
                "Low" => 4,
                _ => 5
            };
        }

        /// <summary>
        /// FIX (Completed Count Alignment): Split an AssignedEngineer raw string into a
        /// list of individual engineer names. Handles comma-separated values, trims
        /// whitespace, and drops empty entries. Returns an empty enumerable for
        /// null/whitespace input.
        /// </summary>
        private static IEnumerable<string> SplitEngineerNames(string? assignedEngineer)
        {
            if (string.IsNullOrWhiteSpace(assignedEngineer))
                return Array.Empty<string>();

            return assignedEngineer
                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(n => n.Trim())
                .Where(n => !string.IsNullOrEmpty(n));
        }

        /// <summary>
        /// FIX (Completed Count Alignment): Return true if the given AssignedEngineer
        /// raw string contains the target engineer name as a full (case-insensitive)
        /// individual entry — NOT a substring match. This prevents:
        ///   1. Substring collisions (e.g. "John" matching "Johnson").
        ///   2. Double-counting tasks assigned to multiple engineers via commas.
        /// </summary>
        private static bool AssignedToEngineerExactly(string? assignedEngineer, string engineerName)
        {
            if (string.IsNullOrWhiteSpace(assignedEngineer) || string.IsNullOrWhiteSpace(engineerName))
                return false;

            foreach (var name in SplitEngineerNames(assignedEngineer))
            {
                if (string.Equals(name, engineerName.Trim(), StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        /// <summary>
        /// Shared helper to build an EngineerWorkloadDto for a given engineer name.
        /// Extracted from GetEngineerWorkloadAsync to avoid code duplication.
        /// </summary>
        private EngineerWorkloadDto BuildEngineerWorkloadDto(
            string engineerName,
            List<TaskEntity> allTasks,
            List<CompletedTask> completedTasksTable)
        {
            // FIXED (Completed Count Alignment): Use exact (individual) name match instead
            // of Contains() to avoid counting tasks assigned to OTHER engineers that happen
            // to share a substring or appear together in a comma-separated assignment.
            var engineerAllTasks = allTasks
                .Where(t => AssignedToEngineerExactly(t.AssignedEngineer, engineerName))
                .ToList();

            // FIXED: Separate active (non-completed) tasks from completed tasks in Tasks table
            var engineerActiveTasks = engineerAllTasks
                .Where(t => t.Status != DomainTaskStatus.Completed)
                .ToList();

            // FIXED: Get completed tasks FROM THE TASKS TABLE (same source as PerformanceService)
            var engineerCompletedInTasksTable = engineerAllTasks
                .Where(t => t.Status == DomainTaskStatus.Completed)
                .ToList();

            // Also get completed tasks from CompletedTasks table for detailed breakdown info
            // FIX (On-Time Rate Alignment): Deduplicate by OriginalTaskId — SAME as PerformanceService.
            // The CompletedTasks table may contain more than one active record for the same task
            // (e.g., due to re-completion, amendment cycles, or historical migration).
            // Without deduplication the denominator is inflated, producing a different On-Time Rate.
            // FIX (Completed Count Alignment): Use exact (individual) name match instead of
            // Contains() — prevents the Completed count in Engineer Workload from being
            // inflated by comma-separated or substring-overlapping engineer assignments.
            var engineerCompletedTasksDetailed = completedTasksTable
                .Where(ct => AssignedToEngineerExactly(ct.AssignedEngineer, engineerName))
                .GroupBy(ct => ct.OriginalTaskId)
                .Select(g => g.OrderByDescending(ct => ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.TaskCreatedAt).First())
                .ToList();

            var openCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.Pending);
            var inProgressCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
            var onHoldCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
            var blockedCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.Blocked);
            var rejectedCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.Rejected);
            var pausedCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.Paused);
            var pendingTLApprovalCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.PendingTLApproval);
            var cancelledCount = engineerActiveTasks.Count(t => t.Status == DomainTaskStatus.Cancelled);
            
            // FIXED: ActiveCount = Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval + Rejected
            var activeCount = openCount + inProgressCount + onHoldCount + blockedCount 
                            + pausedCount + pendingTLApprovalCount + rejectedCount;

            // FIXED (Issue 2): Create detailed task breakdown using actual EstimatedHours
            var taskBreakdown = engineerActiveTasks.Select(t => new TaskBreakdownDto
            {
                TaskId = t.TaskId,
                SerialNumber = t.SerialNumber ?? "",
                PartNumber = t.PartNumber ?? "",
                Description = t.Description,
                Status = t.Status.ToString(),
                Priority = t.Priority?.LevelName ?? "Unknown",
                Category = t.Category?.Name ?? "Unknown",
                EstimatedHours = t.AdjustedEstimatedHours ?? t.EstimatedHours ?? 8m,
                EstimatedCompletionDate = t.EstimatedCompletionDate,
                TargetCompletionDate = t.TargetCompletionDate,
                CreatedAt = t.CreatedAt,
                IsOverdue = t.EstimatedCompletionDate < DateTime.UtcNow && t.Status != DomainTaskStatus.Completed,
                DaysRemaining = (int)(t.EstimatedCompletionDate - DateTime.UtcNow).TotalDays
            }).ToList();

            // FIX (Issue 2): Workload percentage based on actual hours vs weekly capacity
            var totalActiveEstimatedHours = taskBreakdown.Sum(t => t.EstimatedHours);
            var workloadPercentage = Math.Round(totalActiveEstimatedHours / NetWorkHoursPerWeek * 100m, 2);

            // FIXED: Build completed task breakdown DRIVEN BY CompletedTasks table
            var tasksTableLookup = engineerCompletedInTasksTable
                .ToDictionary(t => t.TaskId, t => t);
            
            // FIXED (On-Time Rate Alignment): Use EngineerCompletedAt ?? ActualCompletionDate
            // as the actual completion timestamp — SAME logic as PerformanceService so that
            // On-Time Rate is identical across both services and reflects real data.
            var completedTaskBreakdown = engineerCompletedTasksDetailed.Select(ct =>
            {
                var hasTasksEntry = tasksTableLookup.TryGetValue(ct.OriginalTaskId, out var t);

                // Unified actual completion date: EngineerCompletedAt has priority, falls back to ActualCompletionDate
                var actualDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate;
                var targetDate = ct.TargetCompletionDate;

                return new CompletedTaskBreakdownDto
                {
                    CompletedTaskId = ct.CompletedTaskId,
                    OriginalTaskId = ct.OriginalTaskId,
                    SerialNumber = ct.SerialNumber ?? "",
                    PartNumber = ct.PartNumber ?? "",
                    Description = ct.Description,
                    Priority = ct.Priority?.LevelName ?? "Unknown",
                    Category = ct.Category?.Name ?? "Unknown",
                    CompletedAt = ct.CompletedAt,
                    ActualCompletionDate = actualDate,
                    TargetCompletionDate = targetDate,
                    // FIXED: On-time logic aligned with PerformanceService - uses EngineerCompletedAt ?? ActualCompletionDate
                    WasOnTime = actualDate.HasValue && targetDate.HasValue && actualDate.Value <= targetDate.Value,
                    CompletionDays = actualDate.HasValue && ct.TaskCreatedAt != default
                        ? (int)(actualDate.Value - ct.TaskCreatedAt).TotalDays
                        : (hasTasksEntry && t!.ActualCompletionDate.HasValue
                            ? (int)(t!.ActualCompletionDate.Value - t!.CreatedAt).TotalDays
                            : 0),
                    HasAmendmentRequest = ct.AmendmentRequest,
                    AmendmentStatus = ct.AmendmentStatus?.ToString()
                };
            }).ToList();

            // CompletedEstimatedHours
            var completedEstimatedHours = engineerCompletedTasksDetailed.Sum(ct =>
            {
                if (tasksTableLookup.TryGetValue(ct.OriginalTaskId, out var t))
                    return t.AdjustedEstimatedHours ?? t.EstimatedHours ?? 8m;
                return 8m;
            });

            var completedCount = engineerCompletedTasksDetailed.Count;
            var handledCount = activeCount + completedCount + cancelledCount;

            // FIXED (On-Time Rate Alignment): Compute On-Time Rate using the exact same
            // formula as PerformanceService: onTimeCompleted / totalCompleted * 100.
            // The WasOnTime flag is now derived from EngineerCompletedAt ?? ActualCompletionDate
            // so the numerator is identical. The denominator uses completedCount
            // (engineerCompletedTasksDetailed.Count) — identical to PerformanceService's totalCompleted.
            var onTimeCountForRate = completedTaskBreakdown.Count(ct => ct.WasOnTime);
            var onTimeRate = completedCount > 0
                ? Math.Round((decimal)onTimeCountForRate / completedCount * 100m, 2)
                : 0m;

            // Calculate metrics
            var metrics = new WorkloadMetricsDto
            {
                AverageTaskCompletionDays = completedTaskBreakdown.Any()
                    ? Math.Round((decimal)completedTaskBreakdown.Average(ct => ct.CompletionDays), 2)
                    : 0,
                OnTimeCompletionRate = onTimeRate,
                OverdueTasks = taskBreakdown.Count(t => t.IsOverdue),
                UpcomingDeadlines = taskBreakdown.Count(t => t.DaysRemaining <= 3 && t.DaysRemaining >= 0),
                UtilizationRate = Math.Round(workloadPercentage, 2),
                PerformanceRating = workloadPercentage < 50 ? "Low" : workloadPercentage < 75 ? "Good" : workloadPercentage < 90 ? "High" : "Overloaded"
            };

            _logger.LogInformation("Engineer {EngineerName}: Active={Active}, Completed={Completed}, OnTime={OnTime}, OnTimeRate={Rate}% (aligned with PerformanceService), Total={Total}",
                engineerName, activeCount, completedCount, onTimeCountForRate, onTimeRate, handledCount);

            return new EngineerWorkloadDto
            {
                EngineerName = engineerName,
                OpenCount = openCount,
                InProgressCount = inProgressCount,
                OnHoldCount = onHoldCount,
                BlockedCount = blockedCount,
                RejectedCount = rejectedCount,
                PausedCount = pausedCount,
                PendingTLApprovalCount = pendingTLApprovalCount,
                CancelledCount = cancelledCount,
                CompletedCount = completedCount,
                HandledCount = handledCount,
                ActiveCount = activeCount,
                Capacity = 12,
                WorkloadPercentage = workloadPercentage,
                TotalEstimatedHours = taskBreakdown.Sum(t => t.EstimatedHours),
                CompletedEstimatedHours = completedEstimatedHours,
                TaskBreakdown = taskBreakdown,
                CompletedTaskBreakdown = completedTaskBreakdown,
                Metrics = metrics
            };
        }

        public async System.Threading.Tasks.Task<WorkloadSummaryDto> GetWorkloadSummaryAsync()
        {
            try
            {
                var workloads = await GetEngineerWorkloadAsync();
                var workloadList = workloads.ToList();

                // FIXED: Query CompletedTasks table directly for TotalCompleted count
                var totalCompletedFromSource = await _context.CompletedTasks
                    .Where(ct => ct.RecordStatus == RecordStatus.Active && ct.Status == DomainTaskStatus.Completed)
                    .CountAsync();

                var summary = new WorkloadSummaryDto
                {
                    TotalEngineers = workloadList.Count,
                    AverageWorkload = workloadList.Any() ? Math.Round(workloadList.Average(w => w.WorkloadPercentage), 2) : 0,
                    TotalTasks = workloadList.Sum(w => w.HandledCount),
                    TotalCompleted = totalCompletedFromSource,
                    TotalPending = workloadList.Sum(w => w.OpenCount),
                    TotalInProgress = workloadList.Sum(w => w.InProgressCount),
                    TotalOnHold = workloadList.Sum(w => w.OnHoldCount),
                    TotalBlocked = workloadList.Sum(w => w.BlockedCount),
                    TotalRejected = workloadList.Sum(w => w.RejectedCount),
                    TotalEstimatedHours = workloadList.Sum(w => w.TotalEstimatedHours),
                    AverageTasksPerEngineer = workloadList.Any() ? Math.Round((decimal)workloadList.Sum(w => w.HandledCount) / workloadList.Count, 2) : 0,
                    MostLoadedEngineer = workloadList.OrderByDescending(w => w.ActiveCount).FirstOrDefault()?.EngineerName ?? "",
                    LeastLoadedEngineer = workloadList.OrderBy(w => w.ActiveCount).FirstOrDefault()?.EngineerName ?? ""
                };

                return summary;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving workload summary");
                throw;
            }
        }

        public async System.Threading.Tasks.Task<EngineerWorkloadDto?> GetEngineerWorkloadByIdAsync(int userId)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null) return null;

                // FIXED: Query ALL tasks from Tasks table (single source of truth, like PerformanceService)
                // FIX (Completed Count Alignment): Pre-filter with Contains() for DB efficiency
                // (SQL cannot run our C# helper), then apply the exact (individual) name match in memory
                // using AssignedToEngineerExactly() to avoid substring and comma-based over-counting.
                var allTasksCandidate = await _context.Tasks
                    .Include(t => t.Priority)
                    .Include(t => t.Category)
                    .Where(t => t.AssignedEngineer != null &&
                               t.AssignedEngineer.Contains(user.FullName) && 
                               t.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                var allTasks = allTasksCandidate
                    .Where(t => AssignedToEngineerExactly(t.AssignedEngineer, user.FullName))
                    .ToList();

                // Also query CompletedTasks table for detailed breakdown info
                // FIX (On-Time Rate Alignment): Deduplicate by OriginalTaskId — SAME as PerformanceService.
                // Without deduplication the denominator is inflated, producing a different On-Time Rate.
                // FIX (Completed Count Alignment): Apply the exact-match filter after the DB query
                // to avoid substring or comma-separated over-counting.
                var completedTasksDetailedRaw = await _context.CompletedTasks
                    .Include(ct => ct.Priority)
                    .Include(ct => ct.Category)
                    .Where(ct => ct.AssignedEngineer != null &&
                                ct.AssignedEngineer.Contains(user.FullName) &&
                                ct.RecordStatus == RecordStatus.Active &&
                                ct.Status == DomainTaskStatus.Completed)
                    .ToListAsync();

                var completedTasksDetailed = completedTasksDetailedRaw
                    .Where(ct => AssignedToEngineerExactly(ct.AssignedEngineer, user.FullName))
                    .GroupBy(ct => ct.OriginalTaskId)
                    .Select(g => g.OrderByDescending(ct => ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.TaskCreatedAt).First())
                    .ToList();

                // FIXED: Separate active (non-completed) from completed tasks in Tasks table
                var activeTasks = allTasks.Where(t => t.Status != DomainTaskStatus.Completed).ToList();
                var completedInTasksTable = allTasks.Where(t => t.Status == DomainTaskStatus.Completed).ToList();

                var openCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Pending);
                var inProgressCount = activeTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
                var onHoldCount = activeTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
                var blockedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Blocked);
                var rejectedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Rejected);
                var pausedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Paused);
                var pendingTLApprovalCount = activeTasks.Count(t => t.Status == DomainTaskStatus.PendingTLApproval);
                var cancelledCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Cancelled);

                // FIXED: ActiveCount = Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval + Rejected
                var activeCount = openCount + inProgressCount + onHoldCount + blockedCount 
                                + pausedCount + pendingTLApprovalCount + rejectedCount;

                // FIX (Issue 2): Create detailed breakdowns using actual EstimatedHours
                var taskBreakdown = activeTasks.Select(t => new TaskBreakdownDto
                {
                    TaskId = t.TaskId,
                    SerialNumber = t.SerialNumber ?? "",
                    PartNumber = t.PartNumber ?? "",
                    Description = t.Description,
                    Status = t.Status.ToString(),
                    Priority = t.Priority?.LevelName ?? "Unknown",
                    Category = t.Category?.Name ?? "Unknown",
                    EstimatedHours = t.AdjustedEstimatedHours ?? t.EstimatedHours ?? 8m,
                    EstimatedCompletionDate = t.EstimatedCompletionDate,
                    TargetCompletionDate = t.TargetCompletionDate,
                    CreatedAt = t.CreatedAt,
                    IsOverdue = t.EstimatedCompletionDate < DateTime.UtcNow && t.Status != DomainTaskStatus.Completed,
                    DaysRemaining = (int)(t.EstimatedCompletionDate - DateTime.UtcNow).TotalDays
                }).ToList();

                // FIXED: Build completed task breakdown DRIVEN BY CompletedTasks table
                var tasksTableLookup = completedInTasksTable
                    .ToDictionary(t => t.TaskId, t => t);
                
                // FIXED (On-Time Rate Alignment): Use EngineerCompletedAt ?? ActualCompletionDate
                // as the actual completion timestamp — SAME logic as PerformanceService.
                var completedTaskBreakdown = completedTasksDetailed.Select(ct =>
                {
                    var hasTasksEntry = tasksTableLookup.TryGetValue(ct.OriginalTaskId, out var t);

                    // Unified actual completion date: EngineerCompletedAt has priority, falls back to ActualCompletionDate
                    var actualDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate;
                    var targetDate = ct.TargetCompletionDate;

                    return new CompletedTaskBreakdownDto
                    {
                        CompletedTaskId = ct.CompletedTaskId,
                        OriginalTaskId = ct.OriginalTaskId,
                        SerialNumber = ct.SerialNumber ?? "",
                        PartNumber = ct.PartNumber ?? "",
                        Description = ct.Description,
                        Priority = ct.Priority?.LevelName ?? "Unknown",
                        Category = ct.Category?.Name ?? "Unknown",
                        CompletedAt = ct.CompletedAt,
                        ActualCompletionDate = actualDate,
                        TargetCompletionDate = targetDate,
                        // FIXED: On-time logic aligned with PerformanceService
                        WasOnTime = actualDate.HasValue && targetDate.HasValue && actualDate.Value <= targetDate.Value,
                        CompletionDays = actualDate.HasValue && ct.TaskCreatedAt != default
                            ? (int)(actualDate.Value - ct.TaskCreatedAt).TotalDays
                            : (hasTasksEntry && t!.ActualCompletionDate.HasValue
                                ? (int)(t!.ActualCompletionDate.Value - t!.CreatedAt).TotalDays
                                : 0),
                        HasAmendmentRequest = ct.AmendmentRequest,
                        AmendmentStatus = ct.AmendmentStatus?.ToString()
                    };
                }).ToList();

                // FIX (Issue 2): Use actual hours for workload percentage
                var totalActiveEstimatedHours = taskBreakdown.Sum(t => t.EstimatedHours);
                var workloadPercentage = Math.Round(totalActiveEstimatedHours / NetWorkHoursPerWeek * 100m, 2);

                // CompletedEstimatedHours
                var completedEstimatedHours = completedTasksDetailed.Sum(ct =>
                {
                    if (tasksTableLookup.TryGetValue(ct.OriginalTaskId, out var t))
                        return t.AdjustedEstimatedHours ?? t.EstimatedHours ?? 8m;
                    return 8m;
                });

                var completedCount = completedTasksDetailed.Count;
                var handledCount = activeCount + completedCount + cancelledCount;

                // FIXED (On-Time Rate Alignment): Use the exact same formula as PerformanceService:
                //   onTime / totalCompleted * 100
                // where totalCompleted = completedCount (from CompletedTasks table, single source of truth)
                // and onTime is derived from EngineerCompletedAt ?? ActualCompletionDate vs TargetCompletionDate.
                var onTimeCountForRate = completedTaskBreakdown.Count(ct => ct.WasOnTime);
                var onTimeRate = completedCount > 0
                    ? Math.Round((decimal)onTimeCountForRate / completedCount * 100m, 2)
                    : 0m;

                var metrics = new WorkloadMetricsDto
                {
                    AverageTaskCompletionDays = completedTaskBreakdown.Any()
                        ? Math.Round((decimal)completedTaskBreakdown.Average(ct => ct.CompletionDays), 2)
                        : 0,
                    OnTimeCompletionRate = onTimeRate,
                    OverdueTasks = taskBreakdown.Count(t => t.IsOverdue),
                    UpcomingDeadlines = taskBreakdown.Count(t => t.DaysRemaining <= 3 && t.DaysRemaining >= 0),
                    UtilizationRate = Math.Round(workloadPercentage, 2),
                    PerformanceRating = workloadPercentage < 50 ? "Low" : workloadPercentage < 75 ? "Good" : workloadPercentage < 90 ? "High" : "Overloaded"
                };

                return new EngineerWorkloadDto
                {
                    EngineerId = userId,
                    EngineerName = user.FullName,
                    OpenCount = openCount,
                    InProgressCount = inProgressCount,
                    OnHoldCount = onHoldCount,
                    BlockedCount = blockedCount,
                    RejectedCount = rejectedCount,
                    PausedCount = pausedCount,
                    PendingTLApprovalCount = pendingTLApprovalCount,
                    CancelledCount = cancelledCount,
                    CompletedCount = completedCount,
                    HandledCount = handledCount,
                    ActiveCount = activeCount,
                    Capacity = 12,
                    WorkloadPercentage = workloadPercentage,
                    TotalEstimatedHours = taskBreakdown.Sum(t => t.EstimatedHours),
                    CompletedEstimatedHours = completedEstimatedHours,
                    TaskBreakdown = taskBreakdown,
                    CompletedTaskBreakdown = completedTaskBreakdown,
                    Metrics = metrics
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving engineer workload for user {UserId}", userId);
                throw;
            }
        }

        public async System.Threading.Tasks.Task<IEnumerable<WorkloadTrendDto>> GetWorkloadTrendAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                var tasks = await _context.Tasks
                    .Where(t => t.CreatedAt >= startDate && t.CreatedAt <= endDate)
                    .ToListAsync();

                // FIX (Completed Count Alignment): Split comma-separated AssignedEngineer values
                // so each individual engineer appears as its own trend row. Previously, a task
                // assigned to "Alice, Bob" produced a combined "Alice, Bob" row instead of one
                // row per engineer.
                var expandedTasks = tasks.SelectMany(t =>
                {
                    var names = SplitEngineerNames(t.AssignedEngineer).ToList();
                    if (names.Count == 0)
                        return new[] { new { Task = t, Engineer = "Unassigned" } };
                    return names.Select(n => new { Task = t, Engineer = n });
                });

                var trends = expandedTasks
                    .GroupBy(x => new { Date = x.Task.CreatedAt.Date, Engineer = x.Engineer })
                    .Select(g => new WorkloadTrendDto
                    {
                        Date = g.Key.Date,
                        EngineerName = g.Key.Engineer,
                        TaskCount = g.Count(),
                        // FIX: Use actual estimated hours sum for workload percentage
                        WorkloadPercentage = Math.Round(g.Sum(x => x.Task.AdjustedEstimatedHours ?? x.Task.EstimatedHours ?? 8m) / NetWorkHoursPerWeek * 100m, 2)
                    })
                    .OrderBy(t => t.Date)
                    .ToList();

                return trends;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving workload trend");
                throw;
            }
        }

        /// <summary>
        /// FIX (Issue 3): AnalyzeScheduleAsync now properly accounts for weekends and breaks.
        /// </summary>
        public async System.Threading.Tasks.Task<ScheduleAnalysisDto> AnalyzeScheduleAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                var users = await _context.Users
                    .Where(u => u.Role == DomainUserRole.Engineer && u.Status == UserStatus.Active)
                    .ToListAsync();

                var tasks = await _context.Tasks
                    .Where(t => t.EstimatedCompletionDate >= startDate && 
                               t.EstimatedCompletionDate <= endDate &&
                               t.Status != DomainTaskStatus.Completed &&
                               t.Status != DomainTaskStatus.Rejected)
                    .ToListAsync();

                var perUserAnalysis = new List<UserWorkloadAnalysisDto>();
                decimal totalAssigned = 0;
                decimal totalAvailable = 0;

                // FIX (Issue 3): Calculate actual working days (exclude weekends)
                var workDays = 0;
                for (var d = startDate.Date; d <= endDate.Date; d = d.AddDays(1))
                {
                    if (d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday)
                        workDays++;
                }

                foreach (var user in users)
                {
                    // FIX (Completed Count Alignment): Use exact (individual) name match so that
                    // tasks with comma-separated AssignedEngineer values (e.g. "Alice, Bob") are
                    // correctly attributed to each individual engineer.
                    var userTasks = tasks.Where(t => AssignedToEngineerExactly(t.AssignedEngineer, user.FullName)).ToList();
                    var assignedHours = userTasks.Sum(t => t.AdjustedEstimatedHours ?? t.EstimatedHours ?? 8m);
                    var availableHours = workDays * NetWorkHoursPerDay;

                    totalAssigned += assignedHours;
                    totalAvailable += availableHours;

                    perUserAnalysis.Add(new UserWorkloadAnalysisDto
                    {
                        UserId = user.UserId,
                        FullName = user.FullName,
                        AssignedHours = assignedHours,
                        AvailableHours = availableHours,
                        UtilizationPercent = availableHours > 0 ? Math.Round(assignedHours / availableHours * 100m, 2) : null
                    });
                }

                var assignedArray = perUserAnalysis.Select(p => p.AssignedHours).ToList();
                var mean = assignedArray.Any() ? assignedArray.Average() : 0;
                var variance = assignedArray.Any() ? assignedArray.Sum(x => Math.Pow((double)(x - mean), 2)) / assignedArray.Count : 0;
                var stddev = (decimal)Math.Sqrt(variance);

                return new ScheduleAnalysisDto
                {
                    PerUser = perUserAnalysis,
                    Team = new TeamWorkloadDto
                    {
                        TotalAssignedHours = totalAssigned,
                        TotalAvailableHours = totalAvailable,
                        TeamUtilizationPercent = totalAvailable > 0 ? Math.Round(totalAssigned / totalAvailable * 100m, 2) : null
                    },
                    Fairness = new FairnessMetricsDto
                    {
                        Stddev = Math.Round(stddev, 4),
                        CoefVar = mean != 0 ? Math.Round(stddev / (decimal)mean, 4) : null,
                        Gini = CalculateGini(assignedArray),
                        MaxAssigned = assignedArray.Any() ? assignedArray.Max() : 0,
                        MinAssigned = assignedArray.Any() ? assignedArray.Min() : 0,
                        MaxMinRatio = assignedArray.Any() && assignedArray.Min() > 0 ? Math.Round(assignedArray.Max() / assignedArray.Min(), 4) : null
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error analyzing schedule");
                throw;
            }
        }

        /// <summary>
        /// FIX (Issue 4): GenerateScheduleAsync now implements a proper greedy scheduling algorithm.
        /// </summary>
        public System.Threading.Tasks.Task<ScheduleGenerationResultDto> GenerateScheduleAsync(ScheduleGenerationRequestDto request)
        {
            try
            {
                var result = new ScheduleGenerationResultDto();
                var tasks = (request.Tasks ?? new List<TaskScheduleInput>())
                    .OrderByDescending(t => t.Priority).ToList();
                var users = request.Users ?? new List<UserScheduleInput>();

                if (!users.Any())
                    return System.Threading.Tasks.Task.FromResult(result);

                // Build capacity per user per date (working days only, net hours)
                var capacity = new Dictionary<int, Dictionary<DateTime, decimal>>();
                var assignedTotals = new Dictionary<int, decimal>();

                foreach (var user in users)
                {
                    capacity[user.UserId] = new Dictionary<DateTime, decimal>();
                    assignedTotals[user.UserId] = 0;
                    var workHours = user.WorkHoursPerDay > 0 ? user.WorkHoursPerDay : NetWorkHoursPerDay;

                    for (var d = request.StartDate.Date; d <= request.EndDate.Date; d = d.AddDays(1))
                    {
                        if (d.DayOfWeek != DayOfWeek.Saturday && d.DayOfWeek != DayOfWeek.Sunday)
                            capacity[user.UserId][d] = workHours;
                    }
                }

                // Apply time offs
                if (request.TimeOffs != null)
                {
                    foreach (var timeOff in request.TimeOffs)
                    {
                        if (!capacity.ContainsKey(timeOff.UserId)) continue;
                        for (var d = timeOff.StartDate.Date; d <= timeOff.EndDate.Date; d = d.AddDays(1))
                        {
                            if (capacity[timeOff.UserId].ContainsKey(d))
                            {
                                var deduction = timeOff.HoursPerDay ?? capacity[timeOff.UserId][d];
                                capacity[timeOff.UserId][d] = Math.Max(0, capacity[timeOff.UserId][d] - deduction);
                            }
                        }
                    }
                }

                // Greedy assignment: for each task, find the user with least assigned hours
                foreach (var task in tasks)
                {
                    var remaining = task.EstimatedHours;
                    if (remaining <= 0) continue;

                    // Determine candidate users
                    var candidates = task.AssignedUserId.HasValue
                        ? users.Where(u => u.UserId == task.AssignedUserId.Value).ToList()
                        : users.ToList();

                    if (!candidates.Any()) candidates = users.ToList();

                    var windowStart = task.PlannedStartDate?.Date ?? request.StartDate.Date;
                    var windowEnd = task.PlannedEndDate?.Date ?? request.EndDate.Date;

                    // Clamp window to request range
                    if (windowStart < request.StartDate.Date) windowStart = request.StartDate.Date;
                    if (windowEnd > request.EndDate.Date) windowEnd = request.EndDate.Date;

                    for (var d = windowStart; d <= windowEnd && remaining > 0; d = d.AddDays(1))
                    {
                        // Sort candidates by least assigned total (for fairness)
                        var sorted = candidates.OrderBy(u => assignedTotals.GetValueOrDefault(u.UserId, 0)).ToList();

                        foreach (var user in sorted)
                        {
                            if (remaining <= 0) break;
                            if (!capacity[user.UserId].ContainsKey(d) || capacity[user.UserId][d] <= 0) continue;

                            var allocate = Math.Min(capacity[user.UserId][d], remaining);
                            result.ScheduleEntries.Add(new ScheduleEntryDto
                            {
                                TaskId = task.TaskId,
                                UserId = user.UserId,
                                Date = d,
                                AllocatedHours = allocate,
                                Source = "auto"
                            });

                            capacity[user.UserId][d] -= allocate;
                            assignedTotals[user.UserId] = assignedTotals.GetValueOrDefault(user.UserId, 0) + allocate;
                            remaining -= allocate;
                        }
                    }

                    if (remaining > 0)
                    {
                        result.UnscheduledTasks.Add(new UnscheduledTaskDto
                        {
                            TaskId = task.TaskId,
                            RemainingHours = remaining
                        });
                    }
                }

                // Build per-user totals
                foreach (var user in users)
                {
                    result.PerUserTotals[user.UserId] = new UserScheduleSummaryDto
                    {
                        UserId = user.UserId,
                        FullName = user.FullName,
                        AssignedHours = assignedTotals.GetValueOrDefault(user.UserId, 0)
                    };
                }

                return System.Threading.Tasks.Task.FromResult(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating schedule");
                throw;
            }
        }

        private decimal CalculateGini(List<decimal> values)
        {
            if (!values.Any()) return 0;

            var sorted = values.OrderBy(v => v).ToList();
            var n = sorted.Count;
            var sum = sorted.Sum();

            if (sum == 0) return 0;

            decimal cumulative = 0;
            for (int i = 0; i < n; i++)
            {
                cumulative += (i + 1) * sorted[i];
            }

            return Math.Round((2 * cumulative) / (n * sum) - (n + 1) / (decimal)n, 4);
        }
    }
}