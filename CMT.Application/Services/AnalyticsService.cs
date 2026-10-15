using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public interface IAnalyticsService
    {
        Task<CompletionRateAnalyticsDto> GetCompletionRateAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null);
        Task<AvgDelayAnalyticsDto> GetAvgDelayAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null);
        Task<TasksCompletedAnalyticsDto> GetTasksCompletedAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null);
        Task<PendingTasksAnalyticsDto> GetPendingTasksAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null);
    }

    public class AnalyticsService : IAnalyticsService
    {
        private readonly ApplicationDbContext _context;
        private readonly IDirectorService _directorService;
        private readonly ILogger<AnalyticsService> _logger;

        public AnalyticsService(
            ApplicationDbContext context, 
            IDirectorService directorService,
            ILogger<AnalyticsService> logger)
        {
            _context = context;
            _directorService = directorService;
            _logger = logger;
        }

        public async Task<CompletionRateAnalyticsDto> GetCompletionRateAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null)
        {
            var (activeTasks, completedTasks) = await GetFilteredTasksAsync(userId, userRole, userShopId);

            // Count statuses from active tasks table
            var inProgressCount = activeTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
            var pendingCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Pending);
            var blockedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Blocked);
            var onHoldCount = activeTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
            var pausedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Paused);
            var rejectedCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Rejected);
            var cancelledCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Cancelled);
            var pendingTLCount = activeTasks.Count(t => t.Status == DomainTaskStatus.PendingTLApproval);
            // Tasks with Completed status still in the active table (not yet moved)
            var completedInActiveCount = activeTasks.Count(t => t.Status == DomainTaskStatus.Completed);

            // Completed tasks from the completed_tasks table
            var completedCount = completedTasks.Count;

            // Total completed = completed_tasks table + any still marked Completed in active table
            var totalCompleted = completedCount + completedInActiveCount;

            // Total tasks = all active (non-completed) + all completed
            // Exclude tasks in active table that are already Completed to avoid double-counting
            var nonCompletedActiveCount = activeTasks.Count(t => t.Status != DomainTaskStatus.Completed);
            var totalTasks = nonCompletedActiveCount + totalCompleted;

            // Completion rate = completed / total * 100
            var completionRate = totalTasks > 0 ? (double)totalCompleted / totalTasks * 100 : 0;

            // Status breakdown - include all relevant statuses
            var statusBreakdown = new Dictionary<string, int>();
            if (totalCompleted > 0) statusBreakdown["Completed"] = totalCompleted;
            if (inProgressCount > 0) statusBreakdown["In Progress"] = inProgressCount;
            if (pendingCount > 0) statusBreakdown["Pending"] = pendingCount;
            if (blockedCount > 0) statusBreakdown["Blocked"] = blockedCount;
            if (onHoldCount > 0) statusBreakdown["On Hold"] = onHoldCount;
            if (pausedCount > 0) statusBreakdown["Paused"] = pausedCount;
            if (rejectedCount > 0) statusBreakdown["Rejected"] = rejectedCount;
            if (cancelledCount > 0) statusBreakdown["Cancelled"] = cancelledCount;
            if (pendingTLCount > 0) statusBreakdown["Pending TL Approval"] = pendingTLCount;

            // Category distribution with engineer breakdown
            // Combine active tasks and completed tasks for a full picture
            var categoryDistribution = new Dictionary<string, CategoryDistributionDto>();

            // Process active tasks (non-completed) by category
            var activeNonCompleted = activeTasks.Where(t => t.Status != DomainTaskStatus.Completed).ToList();
            foreach (var task in activeNonCompleted)
            {
                var categoryName = task.Category?.Name ?? "Uncategorized";
                if (!categoryDistribution.ContainsKey(categoryName))
                {
                    categoryDistribution[categoryName] = new CategoryDistributionDto
                    {
                        CategoryName = categoryName,
                        TotalTasks = 0,
                        CompletedTasks = 0,
                        CompletionRate = 0,
                        EngineerDistribution = new Dictionary<string, int>()
                    };
                }

                categoryDistribution[categoryName].TotalTasks++;

                var engineers = (task.AssignedEngineer ?? "Unassigned")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(e => e.Trim())
                    .Where(e => !string.IsNullOrEmpty(e));

                foreach (var engineer in engineers)
                {
                    categoryDistribution[categoryName].EngineerDistribution[engineer] =
                        categoryDistribution[categoryName].EngineerDistribution.GetValueOrDefault(engineer, 0) + 1;
                }
            }

            // Process completed tasks (from completed_tasks table) by category
            foreach (var ct in completedTasks)
            {
                var categoryName = ct.Category?.Name ?? "Uncategorized";
                if (!categoryDistribution.ContainsKey(categoryName))
                {
                    categoryDistribution[categoryName] = new CategoryDistributionDto
                    {
                        CategoryName = categoryName,
                        TotalTasks = 0,
                        CompletedTasks = 0,
                        CompletionRate = 0,
                        EngineerDistribution = new Dictionary<string, int>()
                    };
                }

                categoryDistribution[categoryName].TotalTasks++;
                categoryDistribution[categoryName].CompletedTasks++;

                var engineers = (ct.AssignedEngineer ?? "Unassigned")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(e => e.Trim())
                    .Where(e => !string.IsNullOrEmpty(e));

                foreach (var engineer in engineers)
                {
                    categoryDistribution[categoryName].EngineerDistribution[engineer] =
                        categoryDistribution[categoryName].EngineerDistribution.GetValueOrDefault(engineer, 0) + 1;
                }
            }

            // Also process completed tasks still in the active table
            var completedInActive = activeTasks.Where(t => t.Status == DomainTaskStatus.Completed).ToList();
            foreach (var task in completedInActive)
            {
                var categoryName = task.Category?.Name ?? "Uncategorized";
                if (!categoryDistribution.ContainsKey(categoryName))
                {
                    categoryDistribution[categoryName] = new CategoryDistributionDto
                    {
                        CategoryName = categoryName,
                        TotalTasks = 0,
                        CompletedTasks = 0,
                        CompletionRate = 0,
                        EngineerDistribution = new Dictionary<string, int>()
                    };
                }

                categoryDistribution[categoryName].TotalTasks++;
                categoryDistribution[categoryName].CompletedTasks++;

                var engineers = (task.AssignedEngineer ?? "Unassigned")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(e => e.Trim())
                    .Where(e => !string.IsNullOrEmpty(e));

                foreach (var engineer in engineers)
                {
                    categoryDistribution[categoryName].EngineerDistribution[engineer] =
                        categoryDistribution[categoryName].EngineerDistribution.GetValueOrDefault(engineer, 0) + 1;
                }
            }

            // Calculate per-category completion rates
            foreach (var cat in categoryDistribution.Values)
            {
                cat.CompletionRate = cat.TotalTasks > 0 ? (double)cat.CompletedTasks / cat.TotalTasks * 100 : 0;
            }

            // Completion trend from completed_tasks table (most recent completions)
            var completionTrend = completedTasks
                .OrderByDescending(ct => ct.CompletedAt)
                .Take(10)
                .Select(ct => new CompletionTrendItemDto
                {
                    TaskId = ct.OriginalTaskId,
                    SerialNumber = ct.SerialNumber ?? "",
                    PartNumber = ct.PartNumber ?? "",
                    Description = ct.Description,
                    Engineer = ct.AssignedEngineer ?? "Unassigned",
                    Priority = ct.Priority?.LevelName ?? "Unknown",
                    Date = ct.CompletedAt,
                    DelayDays = CalculateDelayDays(
                        ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.CompletedAt,
                        ct.TargetCompletionDate ?? ct.EstimatedCompletionDate)
                })
                .ToList();

            _logger.LogInformation(
                "GetCompletionRateAnalyticsAsync: TotalTasks={Total}, Completed={Completed}, InProgress={InProgress}, Pending={Pending}, Blocked={Blocked}, OnHold={OnHold}, CompletionRate={Rate:F1}%",
                totalTasks, totalCompleted, inProgressCount, pendingCount, blockedCount, onHoldCount, completionRate);

            return new CompletionRateAnalyticsDto
            {
                TotalTasks = totalTasks,
                CompletedTasks = totalCompleted,
                InProgressTasks = inProgressCount,
                PendingTasks = pendingCount,
                BlockedTasks = blockedCount,
                OnHoldTasks = onHoldCount,
                PausedTasks = pausedCount,
                RejectedTasks = rejectedCount,
                CancelledTasks = cancelledCount,
                PendingTLApprovalTasks = pendingTLCount,
                CompletionRate = completionRate,
                StatusBreakdown = statusBreakdown,
                CategoryDistribution = categoryDistribution,
                CompletionTrend = completionTrend
            };
        }

        public async Task<AvgDelayAnalyticsDto> GetAvgDelayAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null)
        {
            var (activeTasks, completedTasks) = await GetFilteredTasksAsync(userId, userRole, userShopId);

            _logger.LogInformation("GetAvgDelayAnalyticsAsync: Total completed tasks retrieved: {Count}", completedTasks.Count);

            // Also include tasks marked Completed in the active table (not yet moved)
            var completedInActive = activeTasks
                .Where(t => t.Status == DomainTaskStatus.Completed)
                .ToList();

            if (!completedTasks.Any() && !completedInActive.Any())
            {
                _logger.LogWarning("GetAvgDelayAnalyticsAsync: No completed tasks found");
                return new AvgDelayAnalyticsDto
                {
                    AvgDelayDays = 0,
                    AvgLateDelay = 0,
                    AvgEarlyDelivery = 0,
                    TotalAnalyzed = 0,
                    OnTime = 0,
                    Early = 0,
                    Late = 0,
                    OnTimePercentage = "0",
                    EarlyPercentage = "0",
                    LatePercentage = "0",
                    DelayBreakdown = new List<DelayAnalysisItemDto>()
                };
            }

            // Process each completed task
            var delayAnalysis = new List<DelayAnalysisItemDto>();
            var seenTaskIds = new HashSet<int>();

            // Process completed_tasks table entries first
            foreach (var ct in completedTasks)
            {
                // Prefer EngineerCompletedAt (when engineer marked task complete),
                // then ActualCompletionDate, then CompletedAt (TL approval time) as last resort
                DateTime actualDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.CompletedAt;
                
                // Use TargetCompletionDate if available, otherwise use EstimatedCompletionDate
                DateTime? targetDate = ct.TargetCompletionDate ?? ct.EstimatedCompletionDate;

                // Skip only if we truly have no target date
                if (!targetDate.HasValue || targetDate.Value == DateTime.MinValue)
                {
                    _logger.LogDebug("Skipping completed task {TaskId} - no valid target date", ct.OriginalTaskId);
                    continue;
                }

                // Skip if actual date is invalid
                if (actualDate == DateTime.MinValue)
                {
                    _logger.LogDebug("Skipping completed task {TaskId} - no valid actual date", ct.OriginalTaskId);
                    continue;
                }

                // Calculate delay in days (can be negative for early delivery)
                var delayDays = (int)Math.Round((actualDate - targetDate.Value).TotalDays);

                string status;
                if (delayDays == 0)
                {
                    status = "On Time";
                }
                else if (delayDays < 0)
                {
                    status = "Early Delivery";
                }
                else
                {
                    status = "Late Delivery";
                }

                delayAnalysis.Add(new DelayAnalysisItemDto
                {
                    TaskId = ct.OriginalTaskId,
                    SerialNumber = ct.SerialNumber ?? "",
                    PartNumber = ct.PartNumber ?? "",
                    Description = ct.Description,
                    DelayDays = delayDays,
                    Status = status,
                    ActualDate = actualDate.ToString("yyyy-MM-dd"),
                    TargetDate = targetDate.Value.ToString("yyyy-MM-dd"),
                    Engineer = ct.AssignedEngineer ?? "Unassigned",
                    Priority = ct.Priority?.LevelName ?? "Unknown"
                });
                seenTaskIds.Add(ct.OriginalTaskId);
            }

            // Process completed tasks still in the active table (avoid duplicates)
            foreach (var task in completedInActive)
            {
                if (seenTaskIds.Contains(task.TaskId)) continue;

                DateTime actualDate = task.ActualCompletionDate ?? DateTime.MinValue;
                DateTime? targetDate = task.TargetCompletionDate ?? task.EstimatedCompletionDate;

                if (!targetDate.HasValue || targetDate.Value == DateTime.MinValue) continue;
                if (actualDate == DateTime.MinValue) continue;

                var delayDays = (int)Math.Round((actualDate - targetDate.Value).TotalDays);

                string status;
                if (delayDays == 0) status = "On Time";
                else if (delayDays < 0) status = "Early Delivery";
                else status = "Late Delivery";

                delayAnalysis.Add(new DelayAnalysisItemDto
                {
                    TaskId = task.TaskId,
                    SerialNumber = task.SerialNumber ?? "",
                    PartNumber = task.PartNumber ?? "",
                    Description = task.Description,
                    DelayDays = delayDays,
                    Status = status,
                    ActualDate = actualDate.ToString("yyyy-MM-dd"),
                    TargetDate = targetDate.Value.ToString("yyyy-MM-dd"),
                    Engineer = task.AssignedEngineer ?? "Unassigned",
                    Priority = task.Priority?.LevelName ?? "Unknown"
                });
                seenTaskIds.Add(task.TaskId);
            }

            _logger.LogInformation("GetAvgDelayAnalyticsAsync: Tasks with valid dates for analysis: {Count}", delayAnalysis.Count);

            if (!delayAnalysis.Any())
            {
                _logger.LogWarning("GetAvgDelayAnalyticsAsync: No tasks with valid dates found after processing");
                return new AvgDelayAnalyticsDto
                {
                    AvgDelayDays = 0,
                    AvgLateDelay = 0,
                    AvgEarlyDelivery = 0,
                    TotalAnalyzed = 0,
                    OnTime = 0,
                    Early = 0,
                    Late = 0,
                    OnTimePercentage = "0",
                    EarlyPercentage = "0",
                    LatePercentage = "0",
                    DelayBreakdown = new List<DelayAnalysisItemDto>()
                };
            }

            // Sort by delay days (most delayed first)
            delayAnalysis = delayAnalysis.OrderByDescending(d => d.DelayDays).ToList();

            // Calculate counts
            var onTime = delayAnalysis.Count(d => d.DelayDays == 0);
            var early = delayAnalysis.Count(d => d.DelayDays < 0);
            var late = delayAnalysis.Count(d => d.DelayDays > 0);

            _logger.LogInformation("GetAvgDelayAnalyticsAsync: OnTime={OnTime}, Early={Early}, Late={Late}", onTime, early, late);

            // Calculate averages
            var avgDelayDays = delayAnalysis.Average(d => d.DelayDays);

            var avgEarlyDelivery = early > 0
                ? Math.Abs(delayAnalysis.Where(d => d.DelayDays < 0).Average(d => d.DelayDays))
                : 0;

            var avgLateDelay = late > 0
                ? delayAnalysis.Where(d => d.DelayDays > 0).Average(d => d.DelayDays)
                : 0;

            // Calculate percentages
            var totalAnalyzed = delayAnalysis.Count;
            var onTimePercentage = totalAnalyzed > 0 ? (double)onTime / totalAnalyzed * 100 : 0;
            var earlyPercentage = totalAnalyzed > 0 ? (double)early / totalAnalyzed * 100 : 0;
            var latePercentage = totalAnalyzed > 0 ? (double)late / totalAnalyzed * 100 : 0;

            _logger.LogInformation(
                "GetAvgDelayAnalyticsAsync: Results - Total: {Total}, OnTime: {OnTime} ({OnTimePercent}%), Early: {Early} ({EarlyPercent}%), Late: {Late} ({LatePercent}%)",
                totalAnalyzed, onTime, onTimePercentage, early, earlyPercentage, late, latePercentage);

            return new AvgDelayAnalyticsDto
            {
                AvgDelayDays = avgDelayDays,
                AvgLateDelay = avgLateDelay,
                AvgEarlyDelivery = avgEarlyDelivery,
                TotalAnalyzed = totalAnalyzed,
                OnTime = onTime,
                Early = early,
                Late = late,
                OnTimePercentage = onTimePercentage.ToString("F1"),
                EarlyPercentage = earlyPercentage.ToString("F1"),
                LatePercentage = latePercentage.ToString("F1"),
                DelayBreakdown = delayAnalysis.Take(50).ToList()
            };
        }

        public async Task<TasksCompletedAnalyticsDto> GetTasksCompletedAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null)
        {
            var (activeTasks, completedTasks) = await GetFilteredTasksAsync(userId, userRole, userShopId);

            // Also include tasks marked Completed in the active table
            var completedInActive = activeTasks
                .Where(t => t.Status == DomainTaskStatus.Completed)
                .ToList();

            var totalCompleted = completedTasks.Count + completedInActive.Count;

            // Completion by priority - combine both sources
            var byPriority = new Dictionary<string, int>();

            foreach (var ct in completedTasks)
            {
                var priority = ct.Priority?.LevelName ?? "Unknown";
                byPriority[priority] = byPriority.GetValueOrDefault(priority, 0) + 1;
            }
            foreach (var task in completedInActive)
            {
                var priority = task.Priority?.LevelName ?? "Unknown";
                byPriority[priority] = byPriority.GetValueOrDefault(priority, 0) + 1;
            }

            // Completion by engineer - combine both sources
            var byEngineer = new Dictionary<string, int>();

            void AddEngineerCounts(string? assignedEngineer)
            {
                var engineers = (assignedEngineer ?? "Unassigned")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(e => e.Trim())
                    .Where(e => !string.IsNullOrEmpty(e));

                foreach (var engineer in engineers)
                {
                    byEngineer[engineer] = byEngineer.GetValueOrDefault(engineer, 0) + 1;
                }
            }

            foreach (var ct in completedTasks) AddEngineerCounts(ct.AssignedEngineer);
            foreach (var task in completedInActive) AddEngineerCounts(task.AssignedEngineer);

            // Priority stats with completion rates
            // Total per priority = active non-completed + completed (from both tables)
            var priorityStats = new Dictionary<string, PriorityStatsDto>();
            var priorities = new[] { "High", "Medium", "Low" };

            foreach (var priority in priorities)
            {
                var completedWithPriority = completedTasks.Count(ct => ct.Priority?.LevelName == priority)
                    + completedInActive.Count(t => t.Priority?.LevelName == priority);
                var activeWithPriority = activeTasks.Count(t =>
                    t.Status != DomainTaskStatus.Completed && t.Priority?.LevelName == priority);
                var totalWithPriority = completedWithPriority + activeWithPriority;

                if (totalWithPriority > 0)
                {
                    priorityStats[priority] = new PriorityStatsDto
                    {
                        Completed = completedWithPriority,
                        Total = totalWithPriority,
                        Rate = totalWithPriority > 0 ? (double)completedWithPriority / totalWithPriority * 100 : 0
                    };
                }
            }

            // Recent completions from completed_tasks table
            var recentCompletions = completedTasks
                .OrderByDescending(ct => ct.CompletedAt)
                .Take(10)
                .Select(ct => new RecentCompletionItemDto
                {
                    TaskId = ct.OriginalTaskId,
                    SerialNumber = ct.SerialNumber ?? "",
                    PartNumber = ct.PartNumber ?? "",
                    Description = ct.Description,
                    Engineer = ct.AssignedEngineer ?? "Unassigned",
                    Priority = ct.Priority?.LevelName ?? "Unknown",
                    CompletedDate = ct.CompletedAt.ToString("yyyy-MM-dd"),
                    CreatedDate = (ct.TaskAssignedAt ?? ct.TaskCreatedAt).ToString("yyyy-MM-dd")
                })
                .ToList();

            return new TasksCompletedAnalyticsDto
            {
                TotalCompleted = totalCompleted,
                ByPriority = byPriority,
                ByEngineer = byEngineer,
                PriorityStats = priorityStats,
                RecentCompletions = recentCompletions
            };
        }

        public async Task<PendingTasksAnalyticsDto> GetPendingTasksAnalyticsAsync(int? userId = null, string? userRole = null, int? userShopId = null)
        {
            var (activeTasks, _) = await GetFilteredTasksAsync(userId, userRole, userShopId);

            // Include all non-completed active statuses
            var relevantTasks = activeTasks.Where(t => 
                t.Status == DomainTaskStatus.Pending || 
                t.Status == DomainTaskStatus.InProgress || 
                t.Status == DomainTaskStatus.Blocked ||
                t.Status == DomainTaskStatus.OnHold ||
                t.Status == DomainTaskStatus.Paused ||
                t.Status == DomainTaskStatus.PendingTLApproval
            ).ToList();

            var totalPending = relevantTasks.Count;
            var now = DateTime.UtcNow;
            var overdue = relevantTasks.Count(t => 
                (t.TargetCompletionDate ?? t.EstimatedCompletionDate) < now);

            // By status - show all relevant statuses
            var byStatus = relevantTasks
                .GroupBy(t => GetHumanReadableStatus(t.Status))
                .ToDictionary(g => g.Key, g => g.Count());

            // By priority
            var byPriority = relevantTasks
                .GroupBy(t => t.Priority?.LevelName ?? "Unknown")
                .ToDictionary(g => g.Key, g => g.Count());

            // By engineer
            var byEngineer = new Dictionary<string, int>();
            foreach (var task in relevantTasks)
            {
                var engineers = (task.AssignedEngineer ?? "Unassigned")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(e => e.Trim())
                    .Where(e => !string.IsNullOrEmpty(e));

                foreach (var engineer in engineers)
                {
                    byEngineer[engineer] = byEngineer.GetValueOrDefault(engineer, 0) + 1;
                }
            }

            // Pending tasks details with real statuses
            var pendingTasksDetails = relevantTasks
                .OrderByDescending(t => (t.TargetCompletionDate ?? t.EstimatedCompletionDate) < now)
                .ThenBy(t => t.TargetCompletionDate ?? t.EstimatedCompletionDate)
                .Take(15)
                .Select(t => new PendingTaskDetailDto
                {
                    TaskId = t.TaskId,
                    SerialNumber = t.SerialNumber ?? "",
                    PartNumber = t.PartNumber ?? "",
                    Description = t.Description,
                    Status = GetHumanReadableStatus(t.Status),
                    Priority = t.Priority?.LevelName ?? "Unknown",
                    Engineer = t.AssignedEngineer ?? "Unassigned",
                    TargetDate = t.TargetCompletionDate.HasValue 
                        ? t.TargetCompletionDate.Value.ToString("yyyy-MM-dd") 
                        : t.EstimatedCompletionDate.ToString("yyyy-MM-dd"),
                    CreatedAt = (t.AssignedAt ?? t.CreatedAt).ToString("yyyy-MM-dd"),
                    IsOverdue = (t.TargetCompletionDate ?? t.EstimatedCompletionDate) < now
                })
                .ToList();

            return new PendingTasksAnalyticsDto
            {
                TotalPending = totalPending,
                Overdue = overdue,
                ByStatus = byStatus,
                ByPriority = byPriority,
                ByEngineer = byEngineer,
                PendingTasks = pendingTasksDetails
            };
        }

        /// <summary>
        /// Enhanced filtering with Director scope support.
        /// Returns active tasks (from Tasks table) and completed tasks (from completed_tasks table).
        /// </summary>
        private async Task<(List<CMT.Domain.Models.Task> activeTasks, List<CompletedTask> completedTasks)> GetFilteredTasksAsync(
            int? userId, string? userRole, int? userShopId)
        {
            var activeTasksQuery = _context.Tasks
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Shop)
                .AsQueryable();

            var completedTasksQuery = _context.CompletedTasks
                .Where(ct => ct.RecordStatus == RecordStatus.Active)
                .Include(ct => ct.Creator)
                .Include(ct => ct.Category)
                .Include(ct => ct.Priority)
                .Include(ct => ct.Shop)
                .AsQueryable();

            // Apply role-based filtering
            if (userId.HasValue && !string.IsNullOrEmpty(userRole))
            {
                var role = userRole.ToLower().Replace("-", "_").Replace(" ", "_");

                switch (role)
                {
                    case "director":
                        _logger.LogInformation("Applying Director scoping for userId {UserId}", userId.Value);
                        var directorUserIds = await _directorService.GetDepartmentUserIdsAsync(userId.Value);
                        _logger.LogInformation("Director {UserId} has access to {Count} users", userId.Value, directorUserIds.Count);
                        
                        activeTasksQuery = activeTasksQuery.Where(t => directorUserIds.Contains(t.CreatedBy));
                        completedTasksQuery = completedTasksQuery.Where(ct => directorUserIds.Contains(ct.CreatedBy));
                        break;

                    case "engineer":
                        var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId.Value);
                        if (user != null)
                        {
                            var userName = user.FullName;
                            activeTasksQuery = activeTasksQuery.Where(t => 
                                t.AssignedEngineer != null && t.AssignedEngineer.Contains(userName));
                            completedTasksQuery = completedTasksQuery.Where(ct => 
                                ct.AssignedEngineer != null && ct.AssignedEngineer.Contains(userName));
                        }
                        break;

                    case "customer":
                    case "customer_personnel":
                        activeTasksQuery = activeTasksQuery.Where(t => t.CreatedBy == userId.Value);
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.CreatedBy == userId.Value);
                        break;

                    case "shop_tl":
                        if (userShopId.HasValue)
                        {
                            var createdUserIds = await _context.Users
                                .Where(u => u.CreatedByUserId == userId.Value && u.Status == UserStatus.Active)
                                .Select(u => u.UserId)
                                .ToListAsync();

                            var allUserIds = new List<int> { userId.Value };
                            allUserIds.AddRange(createdUserIds);

                            activeTasksQuery = activeTasksQuery.Where(t => allUserIds.Contains(t.CreatedBy));
                            completedTasksQuery = completedTasksQuery.Where(ct => allUserIds.Contains(ct.CreatedBy));
                        }
                        break;
                }
            }

            var activeTasks = await activeTasksQuery.ToListAsync();
            var completedTasks = await completedTasksQuery.ToListAsync();

            return (activeTasks, completedTasks);
        }

        private string GetHumanReadableStatus(DomainTaskStatus status)
        {
            return status switch
            {
                DomainTaskStatus.Pending => "Pending",
                DomainTaskStatus.InProgress => "In Progress",
                DomainTaskStatus.Completed => "Completed",
                DomainTaskStatus.Blocked => "Blocked",
                DomainTaskStatus.OnHold => "On Hold",
                DomainTaskStatus.Rejected => "Rejected",
                DomainTaskStatus.Cancelled => "Cancelled",
                DomainTaskStatus.Paused => "Paused",
                DomainTaskStatus.PendingTLApproval => "Pending TL Approval",
                _ => status.ToString()
            };
        }

        private int CalculateDelayDays(DateTime actualDate, DateTime? targetDate)
        {
            if (!targetDate.HasValue) return 0;
            return (int)Math.Round((actualDate - targetDate.Value).TotalDays);
        }
    }
}