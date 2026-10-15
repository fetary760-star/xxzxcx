using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    /// <summary>
    /// PERFORMANCE SERVICE — AMENDED (7 fixes — full consistency with completed-task-metrics.ts)
    ///
    /// FIX #1  Bucket reconciliation
    ///         Completed = Early + On-Time + Delayed is now guaranteed.
    ///          - Early      : finished strictly BEFORE the target date.
    ///          - On-Time    : finished exactly ON the target date
    ///                         (or the task has no usable target/actual date).
    ///          - Delayed    : finished AFTER the target date.
    ///         MetTargetCount (= Early + OnTime) is exposed separately and is the
    ///         ONLY value used for the On-Time Rate.
    ///
    /// FIX #2  Filter correctness (drives the Excel export)
    ///          - The status filter is applied to BOTH the Tasks table and the
    ///            CompletedTasks table.
    ///          - Engineer matching is exact per assigned name (comma/semicolon
    ///            separated lists are split) instead of a substring Contains().
    ///          - The date range is normalised once (BOTH bounds on Task Assigned At,
    ///            matching the Completed Tasks view exactly).
    ///
    /// FIX #3  Bucket wiring for the On-Time Rate numerator (see FIX #6 for the
    ///         FORMULA itself).
    ///
    /// FIX #4  Rate Model Alignment (Division-Based, Averaged)
    ///         Per task: Rate = (targetDurationDays / actualDurationDays) × 100
    ///           - Early tasks:   rate = max(ratio, 100)
    ///           - Delayed tasks: rate = min(ratio, 100)
    ///           - On-Time tasks: rate = 100
    ///         Aggregates: Early/Delay Rate = AVERAGE of the per-task rates;
    ///         Efficiency = (Early + Delay + On-Time) / 3, empty category = neutral 100%.
    ///
    /// FIX #5  Decimal-day duration — ROUNDED TO 2 DECIMAL PLACES
    ///         completed-task-metrics.ts (via datetime-utils.ts durationInDays) measures
    ///         Target Duration / Actual Duration with:
    ///             Math.round(((b - a) / 86400000) * 100) / 100
    ///         This is a 2-decimal-place rounding of the full timestamp difference.
    ///         Previously this service used raw TotalDays (full precision), causing
    ///         rate mismatches. Now both durations are rounded to 2 decimal places
    ///         using the same formula: Math.Floor(x * 100 + 0.5) / 100.
    ///
    /// FIX #6  On-Time Rate formula + raw field exposure
    ///          - OnTimeRate now matches the on-screen legend EXACTLY:
    ///            "100% when one or more tasks are completed exactly on the target date,
    ///             otherwise 0.00%."
    ///          - TaskBreakdownDto now also carries CategoryId, TaskAssignedAt,
    ///            EngineerCompletedAt and TlApprovalDate.
    ///
    /// FIX #7  NO UPPER CAP on Early Rate (NEW)
    ///         The frontend's calculateRatioRate() has NO upper cap — a task completed
    ///         in 1/20th of the allowed time legitimately produces 2000%+. The previous
    ///         MAX_TASK_RATE_PERCENT = 1000 cap prevented the backend from ever matching
    ///         values like 2006.62%. The cap is removed so both sides agree.
    ///         Additionally, when targetDurationDays <= 0 the rate is SKIPPED (the
    ///         frontend returns null and excludes such tasks from the average).
    ///
    ///         This ensures Performance Management always matches the Completed Tasks
    ///         export and Performance Summary, on both the count columns and every rate.
    /// </summary>
    public class PerformanceService : IPerformanceService
    {
        /// <summary>Separators used when a task stores several engineers in one string.</summary>
        private static readonly char[] EngineerSeparators = { ',', ';', '|', '/' };

        /// <summary>Efficiency is the average of the three cumulative rates.</summary>
        private const int EFFICIENCY_COMPONENTS = 3;

        /// <summary>An empty Early / Delayed / On-Time category counts as a neutral 100%.</summary>
        private const double NEUTRAL_RATE_PERCENT = 100.0;

        /// <summary>
        /// Below this many decimal days a duration is treated as "same instant" to avoid
        /// dividing by ~0. Matches the frontend's calculateRatioRate() safe-guard.
        /// </summary>
        private const double MIN_SAFE_DURATION_DAYS = 0.01;

        private readonly ApplicationDbContext _context;
        private readonly ILogger<PerformanceService> _logger;

        public PerformanceService(ApplicationDbContext context, ILogger<PerformanceService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<List<EngineerPerformanceDto>> GetEngineerPerformanceAsync(
            string[]? engineerNames = null,
            int? categoryId = null,
            int? priorityId = null,
            int? shopId = null,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null)
        {
            try
            {
                // ===== FIX #2: normalise the filter inputs ONCE =====
                var rangeStart = NormalizeStart(startDate);
                var rangeEnd = NormalizeEnd(endDate);
                var (statusFilter, includeActive, includeCompleted) = ResolveStatusFilter(status);

                // ===== FETCH FROM ACTIVE TASKS TABLE =====
                var activeTasks = new List<Domain.Models.Task>();
                if (includeActive)
                {
                    var activeTasksQuery = _context.Tasks
                        .Where(t => t.RecordStatus == RecordStatus.Active)
                        .Include(t => t.Category)
                        .Include(t => t.Priority)
                        .AsQueryable();

                    if (rangeStart.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => (t.AssignedAt ?? t.CreatedAt) >= rangeStart.Value);
                    if (rangeEnd.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => (t.AssignedAt ?? t.CreatedAt) <= rangeEnd.Value);
                    if (categoryId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.CategoryId == categoryId.Value);
                    if (priorityId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.PriorityId == priorityId.Value);
                    if (shopId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.ShopId == shopId.Value);
                    if (statusFilter.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.Status == statusFilter.Value);

                    activeTasks = await activeTasksQuery.ToListAsync();
                }

                // ===== FETCH FROM COMPLETED TASKS TABLE =====
                // FIX #2: skipped entirely when the caller asked for a non-completed
                // status, otherwise the export contains rows that do not match the filter.
                var completedTasks = new List<CompletedTask>();
                if (includeCompleted)
                {
                    var completedTasksQuery = _context.CompletedTasks
                        .Where(ct => ct.RecordStatus == RecordStatus.Active && ct.Status == DomainTaskStatus.Completed)
                        .Include(ct => ct.Category)
                        .Include(ct => ct.Priority)
                        .AsQueryable();

                    if (rangeStart.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => (ct.TaskAssignedAt ?? ct.TaskCreatedAt) >= rangeStart.Value);
                    if (rangeEnd.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => (ct.TaskAssignedAt ?? ct.TaskCreatedAt) <= rangeEnd.Value);
                    if (categoryId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.CategoryId == categoryId.Value);
                    if (priorityId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.PriorityId == priorityId.Value);
                    if (shopId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.ShopId == shopId.Value);

                    completedTasks = await completedTasksQuery.ToListAsync();
                }

                // ===== BUILD UNIQUE ENGINEER LIST FROM BOTH TABLES =====
                // FIX #2: a task storing "A, B" used to create a bogus "A, B" row in the
                // export. The string is split so only real engineer names are reported.
                var allEngineerNames = activeTasks.SelectMany(t => SplitEngineers(t.AssignedEngineer))
                    .Concat(completedTasks.SelectMany(ct => SplitEngineers(ct.AssignedEngineer)))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                // Filter by specific engineers if provided (exact, case-insensitive)
                if (engineerNames != null && engineerNames.Length > 0)
                {
                    var requested = engineerNames
                        .Where(n => !string.IsNullOrWhiteSpace(n))
                        .Select(n => n.Trim())
                        .ToArray();

                    allEngineerNames = allEngineerNames
                        .Where(name => requested.Any(en => string.Equals(en, name, StringComparison.OrdinalIgnoreCase)))
                        .ToList();
                }

                var performanceList = new List<EngineerPerformanceDto>();

                foreach (var engineerName in allEngineerNames)
                {
                    // FIX #2: exact per-name matching instead of Contains()
                    var engineerActiveTasks = activeTasks
                        .Where(t => IsAssignedTo(t.AssignedEngineer, engineerName))
                        .ToList();

                    var engineerCompletedTasks = completedTasks
                        .Where(ct => IsAssignedTo(ct.AssignedEngineer, engineerName))
                        .GroupBy(ct => ct.OriginalTaskId)
                        .Select(g => g.OrderByDescending(ct => ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.TaskCreatedAt).First())
                        .ToList();

                    var nonCompletedActiveTasks = engineerActiveTasks
                        .Where(t => t.Status != DomainTaskStatus.Completed)
                        .ToList();

                    // ===== FIX #1 + FIX #4/#5/#6/#7: SINGLE SOURCE OF TRUTH, FULLY RECONCILED BUCKETS =====
                    var stats = BuildCompletionStats(engineerCompletedTasks);

                    var totalCompleted = stats.CompletedCount;
                    var totalAssigned = nonCompletedActiveTasks.Count + totalCompleted;

                    // Delay days keep the hold-request/transfer adjustment.
                    var completedForCalc = engineerCompletedTasks.Select(ct => new CompletedTask
                    {
                        OriginalTaskId = ct.OriginalTaskId,
                        Description = ct.Description,
                        AssignedEngineer = ct.AssignedEngineer,
                        CategoryId = ct.CategoryId,
                        PriorityId = ct.PriorityId,
                        TargetCompletionDate = ct.TargetCompletionDate,
                        ActualCompletionDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate,
                        EngineerCompletedAt = ct.EngineerCompletedAt,
                        TaskCreatedAt = ct.TaskCreatedAt,
                        Category = ct.Category,
                        Priority = ct.Priority
                    }).ToList();

                    var totalDelayDays = await CalculateTotalDelayDaysWithTransfersAsync(
                        engineerName, completedForCalc, rangeStart, rangeEnd);

                    // ===== FIX #3/#4/#5/#6/#7: RATES (Division-Based, Averaged, 2dp-rounded duration, no cap) =====
                    var rates = BuildRates(stats);

                    // Count active task statuses
                    var activeTasksCount = nonCompletedActiveTasks.Count;
                    var pendingTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.Pending);
                    var inProgressTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
                    var blockedTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.Blocked);
                    var onHoldTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
                    var pausedTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.Paused);
                    var rejectedTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.Rejected);
                    var cancelledTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.Cancelled);
                    var pendingTLApprovalTasks = nonCompletedActiveTasks.Count(t => t.Status == DomainTaskStatus.PendingTLApproval);

                    _logger.LogInformation(
                        "Performance for {Engineer}: Assigned={Total}, Completed={Completed} (= Early {Early} + OnTime {OnTime} + Delayed {Delayed}), MetTarget={MetTarget}, OnTimeRate={OnTimeRate:F2}%, EarlyRate={EarlyRate:F2}%, DelayRate={DelayRate:F2}%, Efficiency={Efficiency:F2}% ({Rating})",
                        engineerName, totalAssigned, totalCompleted, stats.EarlyCount, stats.ExactlyOnTimeCount,
                        stats.DelayedCount, stats.MetTargetCount, rates.OnTimeRate, rates.EarlyRate,
                        rates.DelayRate, rates.CapacityEfficiencyRate, rates.EfficiencyRating);

                    performanceList.Add(new EngineerPerformanceDto
                    {
                        EngineerName = engineerName,
                        TotalAssignedTasks = totalAssigned,
                        CompletedTasksCount = totalCompleted,
                        EarlyCompletedCount = stats.EarlyCount,
                        ExactlyOnTimeCount = stats.ExactlyOnTimeCount,
                        // FIX #1: exclusive bucket -> Early + OnTime + Delayed == Completed
                        OnTimeCompletedCount = stats.ExactlyOnTimeCount,
                        MetTargetCount = stats.MetTargetCount,
                        DelayedCompletedCount = stats.DelayedCount,
                        TotalDelayDays = totalDelayDays,
                        TotalEarlyDays = stats.TotalEarlyDays,
                        OnTimeRate = rates.OnTimeRate,
                        DelayRate = rates.DelayRate,
                        EarlyRate = rates.EarlyRate,
                        EarlyBonusRate = rates.EarlyBonusRate,
                        CapacityEfficiencyRate = rates.CapacityEfficiencyRate,
                        EfficiencyRating = rates.EfficiencyRating,
                        RateExceedsTarget = rates.RateExceedsTarget,
                        // ===== NEW: rate sample sizes for the WEIGHTED "Overall Total" row =====
                        EarlyRateSampleCount = rates.EarlyRateSampleCount,
                        DelayedRateSampleCount = rates.DelayedRateSampleCount,
                        ActiveTasks = activeTasksCount,
                        PendingTasks = pendingTasks,
                        InProgressTasks = inProgressTasks,
                        BlockedTasks = blockedTasks,
                        OnHoldTasks = onHoldTasks,
                        PausedTasks = pausedTasks,
                        RejectedTasks = rejectedTasks,
                        CancelledTasks = cancelledTasks,
                        PendingTLApprovalTasks = pendingTLApprovalTasks
                    });
                }

                return performanceList.OrderBy(p => p.EngineerName).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting engineer performance metrics");
                throw;
            }
        }

        public async Task<EngineerDetailedPerformanceDto> GetEngineerDetailedPerformanceAsync(
            string engineerName,
            int? categoryId = null,
            int? priorityId = null,
            int? shopId = null,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null)
        {
            try
            {
                var rangeStart = NormalizeStart(startDate);
                var rangeEnd = NormalizeEnd(endDate);
                var (statusFilter, includeActive, includeCompleted) = ResolveStatusFilter(status);

                // ===== FETCH FROM ACTIVE TASKS TABLE =====
                var activeTasks = new List<Domain.Models.Task>();
                if (includeActive)
                {
                    var activeTasksQuery = _context.Tasks
                        .Where(t => t.RecordStatus == RecordStatus.Active &&
                                   !string.IsNullOrEmpty(t.AssignedEngineer) &&
                                   t.AssignedEngineer.Contains(engineerName))
                        .Include(t => t.Category)
                        .Include(t => t.Priority)
                        .AsQueryable();

                    if (rangeStart.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => (t.AssignedAt ?? t.CreatedAt) >= rangeStart.Value);
                    if (rangeEnd.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => (t.AssignedAt ?? t.CreatedAt) <= rangeEnd.Value);
                    if (categoryId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.CategoryId == categoryId.Value);
                    if (priorityId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.PriorityId == priorityId.Value);
                    if (shopId.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.ShopId == shopId.Value);
                    if (statusFilter.HasValue)
                        activeTasksQuery = activeTasksQuery.Where(t => t.Status == statusFilter.Value);

                    // Contains() is only a SQL pre-filter; the exact match is done in memory.
                    activeTasks = (await activeTasksQuery.ToListAsync())
                        .Where(t => IsAssignedTo(t.AssignedEngineer, engineerName))
                        .ToList();
                }

                // ===== FETCH FROM COMPLETED TASKS TABLE =====
                var completedTasksFromTable = new List<CompletedTask>();
                if (includeCompleted)
                {
                    var completedTasksQuery = _context.CompletedTasks
                        .Where(ct => ct.RecordStatus == RecordStatus.Active &&
                                    ct.Status == DomainTaskStatus.Completed &&
                                    !string.IsNullOrEmpty(ct.AssignedEngineer) &&
                                    ct.AssignedEngineer.Contains(engineerName))
                        .Include(ct => ct.Category)
                        .Include(ct => ct.Priority)
                        .AsQueryable();

                    if (rangeStart.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => (ct.TaskAssignedAt ?? ct.TaskCreatedAt) >= rangeStart.Value);
                    if (rangeEnd.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => (ct.TaskAssignedAt ?? ct.TaskCreatedAt) <= rangeEnd.Value);
                    if (categoryId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.CategoryId == categoryId.Value);
                    if (priorityId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.PriorityId == priorityId.Value);
                    if (shopId.HasValue)
                        completedTasksQuery = completedTasksQuery.Where(ct => ct.ShopId == shopId.Value);

                    var completedTasksFromTableRaw = await completedTasksQuery.ToListAsync();

                    completedTasksFromTable = completedTasksFromTableRaw
                        .Where(ct => IsAssignedTo(ct.AssignedEngineer, engineerName))
                        .GroupBy(ct => ct.OriginalTaskId)
                        .Select(g => g.OrderByDescending(ct => ct.EngineerCompletedAt ?? ct.ActualCompletionDate ?? ct.TaskCreatedAt).First())
                        .ToList();
                }

                // ===== CATEGORIZE TASKS BY STATUS =====
                var rejectedTasksList = activeTasks.Where(t => t.Status == DomainTaskStatus.Rejected).ToList();
                var cancelledTasksList = activeTasks.Where(t => t.Status == DomainTaskStatus.Cancelled).ToList();
                var trulyActiveTasks = activeTasks.Where(t => t.Status != DomainTaskStatus.Completed).ToList();

                // ===== BUILD TASK BREAKDOWN =====
                var taskBreakdown = new List<TaskBreakdownDto>();
                var seenTaskIds = new HashSet<int>();

                // 1st: Add completed tasks from CompletedTasks table
                foreach (var ct in completedTasksFromTable)
                {
                    if (seenTaskIds.Contains(ct.OriginalTaskId)) continue;

                    int? delayDays = null;
                    // FIX #1/#3: no target date => nothing to breach => counts as on time.
                    bool isOnTime = true;

                    var actualDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate;
                    if (actualDate.HasValue && ct.TargetCompletionDate.HasValue)
                    {
                        var delay = (actualDate.Value.Date - ct.TargetCompletionDate.Value.Date).Days;
                        delayDays = Math.Max(0, delay);
                        isOnTime = delay <= 0;
                    }
                    else
                    {
                        delayDays = 0;
                    }

                    taskBreakdown.Add(new TaskBreakdownDto
                    {
                        TaskId = ct.OriginalTaskId,
                        Description = ct.Description,
                        Status = "Completed",
                        Category = ct.Category?.Name ?? string.Empty,
                        CategoryName = ct.Category?.Name,
                        CategoryId = ct.CategoryId,
                        Priority = ct.Priority?.LevelName ?? string.Empty,
                        PriorityName = ct.Priority?.LevelName,
                        CreatedAt = ct.TaskCreatedAt,
                        TargetCompletionDate = ct.TargetCompletionDate,
                        ActualCompletionDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate,
                        // ===== FIX #6: raw fields the frontend rate pipeline needs =====
                        TaskAssignedAt = ct.TaskAssignedAt ?? ct.TaskCreatedAt,
                        EngineerCompletedAt = ct.EngineerCompletedAt,
                        TlApprovalDate = ct.MovedToCompletedAt,
                        DelayDays = delayDays,
                        IsOnTime = isOnTime
                    });
                    seenTaskIds.Add(ct.OriginalTaskId);
                }

                // 2nd: Add truly active tasks
                foreach (var task in trulyActiveTasks)
                {
                    if (seenTaskIds.Contains(task.TaskId)) continue;
                    if (task.Status == DomainTaskStatus.Rejected || task.Status == DomainTaskStatus.Cancelled)
                        continue;

                    taskBreakdown.Add(new TaskBreakdownDto
                    {
                        TaskId = task.TaskId,
                        Description = task.Description,
                        Status = GetHumanReadableStatus(task.Status),
                        Category = task.Category?.Name ?? string.Empty,
                        CategoryName = task.Category?.Name,
                        CategoryId = task.CategoryId,
                        Priority = task.Priority?.LevelName ?? string.Empty,
                        PriorityName = task.Priority?.LevelName,
                        CreatedAt = task.CreatedAt,
                        TargetCompletionDate = task.TargetCompletionDate,
                        ActualCompletionDate = null,
                        TaskAssignedAt = task.AssignedAt ?? task.CreatedAt,
                        EngineerCompletedAt = null,
                        TlApprovalDate = null,
                        DelayDays = null,
                        IsOnTime = false
                    });
                    seenTaskIds.Add(task.TaskId);
                }

                // 3rd: Add Rejected tasks
                foreach (var task in rejectedTasksList)
                {
                    if (seenTaskIds.Contains(task.TaskId)) continue;
                    taskBreakdown.Add(new TaskBreakdownDto
                    {
                        TaskId = task.TaskId,
                        Description = task.Description,
                        Status = "Rejected",
                        Category = task.Category?.Name ?? string.Empty,
                        CategoryName = task.Category?.Name,
                        CategoryId = task.CategoryId,
                        Priority = task.Priority?.LevelName ?? string.Empty,
                        PriorityName = task.Priority?.LevelName,
                        CreatedAt = task.CreatedAt,
                        TargetCompletionDate = task.TargetCompletionDate,
                        ActualCompletionDate = null,
                        TaskAssignedAt = task.AssignedAt ?? task.CreatedAt,
                        EngineerCompletedAt = null,
                        TlApprovalDate = null,
                        DelayDays = null,
                        IsOnTime = false
                    });
                    seenTaskIds.Add(task.TaskId);
                }

                // 4th: Add Cancelled tasks
                foreach (var task in cancelledTasksList)
                {
                    if (seenTaskIds.Contains(task.TaskId)) continue;
                    taskBreakdown.Add(new TaskBreakdownDto
                    {
                        TaskId = task.TaskId,
                        Description = task.Description,
                        Status = "Cancelled",
                        Category = task.Category?.Name ?? string.Empty,
                        CategoryName = task.Category?.Name,
                        CategoryId = task.CategoryId,
                        Priority = task.Priority?.LevelName ?? string.Empty,
                        PriorityName = task.Priority?.LevelName,
                        CreatedAt = task.CreatedAt,
                        TargetCompletionDate = task.TargetCompletionDate,
                        ActualCompletionDate = null,
                        TaskAssignedAt = task.AssignedAt ?? task.CreatedAt,
                        EngineerCompletedAt = null,
                        TlApprovalDate = null,
                        DelayDays = null,
                        IsOnTime = false
                    });
                    seenTaskIds.Add(task.TaskId);
                }

                // ===== DERIVE ALL COUNTS =====
                var stats = BuildCompletionStats(completedTasksFromTable);
                var totalCompleted = stats.CompletedCount;
                var nonCompletedActiveCount = trulyActiveTasks.Count;
                var totalAssigned = nonCompletedActiveCount + totalCompleted;

                var completedForCalc = completedTasksFromTable.Select(ct => new CompletedTask
                {
                    OriginalTaskId = ct.OriginalTaskId,
                    Description = ct.Description,
                    AssignedEngineer = ct.AssignedEngineer,
                    CategoryId = ct.CategoryId,
                    PriorityId = ct.PriorityId,
                    TargetCompletionDate = ct.TargetCompletionDate,
                    ActualCompletionDate = ct.EngineerCompletedAt ?? ct.ActualCompletionDate,
                    EngineerCompletedAt = ct.EngineerCompletedAt,
                    TaskCreatedAt = ct.TaskCreatedAt,
                    Category = ct.Category,
                    Priority = ct.Priority
                }).ToList();

                var totalDelayDays = await CalculateTotalDelayDaysWithTransfersAsync(
                    engineerName, completedForCalc, rangeStart, rangeEnd);

                var averageDelayDays = stats.DelayedCount > 0
                    ? Round2((double)totalDelayDays / stats.DelayedCount)
                    : 0;
                var averageEarlyDays = stats.EarlyCount > 0
                    ? Round2((double)stats.TotalEarlyDays / stats.EarlyCount)
                    : 0;

                var rates = BuildRates(stats);

                // Count active task statuses
                var activeTasksCount = trulyActiveTasks.Count;
                var pendingTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.Pending);
                var inProgressTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
                var blockedTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.Blocked);
                var onHoldTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
                var pausedTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.Paused);
                var pendingTLApprovalTasks = trulyActiveTasks.Count(t => t.Status == DomainTaskStatus.PendingTLApproval);

                // Group tasks by category
                var tasksByCategory = taskBreakdown
                    .Where(t => !string.IsNullOrEmpty(t.CategoryName))
                    .GroupBy(t => t.CategoryName!)
                    .ToDictionary(g => g.Key, g => g.Count());

                // Group tasks by priority
                var tasksByPriority = taskBreakdown
                    .Where(t => !string.IsNullOrEmpty(t.PriorityName))
                    .GroupBy(t => t.PriorityName!)
                    .ToDictionary(g => g.Key, g => g.Count());

                return new EngineerDetailedPerformanceDto
                {
                    EngineerName = engineerName,
                    TotalAssignedTasks = totalAssigned,
                    CompletedTasksCount = totalCompleted,
                    EarlyCompletedCount = stats.EarlyCount,
                    ExactlyOnTimeCount = stats.ExactlyOnTimeCount,
                    OnTimeCompletedCount = stats.ExactlyOnTimeCount,
                    MetTargetCount = stats.MetTargetCount,
                    DelayedCompletedCount = stats.DelayedCount,
                    TotalDelayDays = totalDelayDays,
                    TotalEarlyDays = stats.TotalEarlyDays,
                    AverageDelayDays = averageDelayDays,
                    AverageEarlyDays = averageEarlyDays,
                    OnTimeRate = rates.OnTimeRate,
                    DelayRate = rates.DelayRate,
                    EarlyRate = rates.EarlyRate,
                    EarlyBonusRate = rates.EarlyBonusRate,
                    CapacityEfficiencyRate = rates.CapacityEfficiencyRate,
                    EfficiencyRating = rates.EfficiencyRating,
                    RateExceedsTarget = rates.RateExceedsTarget,
                    // ===== NEW: rate sample sizes, echoed by the detail endpoint =====
                    EarlyRateSampleCount = rates.EarlyRateSampleCount,
                    DelayedRateSampleCount = rates.DelayedRateSampleCount,
                    ActiveTasks = activeTasksCount,
                    PendingTasks = pendingTasks,
                    InProgressTasks = inProgressTasks,
                    BlockedTasks = blockedTasks,
                    OnHoldTasks = onHoldTasks,
                    PausedTasks = pausedTasks,
                    RejectedTasks = rejectedTasksList.Count,
                    CancelledTasks = cancelledTasksList.Count,
                    PendingTLApprovalTasks = pendingTLApprovalTasks,
                    TaskBreakdown = taskBreakdown.OrderByDescending(t => t.CreatedAt).ToList(),
                    TasksByCategory = tasksByCategory,
                    TasksByPriority = tasksByPriority
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting detailed engineer performance for {EngineerName}", engineerName);
                throw;
            }
        }

        #region Filter helpers (FIX #2)

        /// <summary>
        /// Start of the selected day (00:00:00).
        /// </summary>
        private static DateTime? NormalizeStart(DateTime? startDate)
            => startDate?.Date;

        /// <summary>
        /// Inclusive end of the selected day (23:59:59.9999999).
        /// A plain "yyyy-MM-dd" coming from the UI parses to 00:00, which used to cut
        /// off everything assigned later on the end day and made the grid and the
        /// export disagree.
        /// </summary>
        private static DateTime? NormalizeEnd(DateTime? endDate)
            => endDate.HasValue ? endDate.Value.Date.AddDays(1).AddTicks(-1) : (DateTime?)null;

        /// <summary>
        /// Translates the status filter into the two tables it has to apply to.
        ///  - no / unknown status  => both tables
        ///  - "Completed"          => CompletedTasks only
        ///  - any other status     => Tasks only (finished tasks must NOT be exported)
        /// </summary>
        private static (DomainTaskStatus? StatusFilter, bool IncludeActive, bool IncludeCompleted) ResolveStatusFilter(string? status)
        {
            if (string.IsNullOrWhiteSpace(status) || string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
                return (null, true, true);

            if (!Enum.TryParse<DomainTaskStatus>(status, true, out var parsed))
                return (null, true, true);

            if (parsed == DomainTaskStatus.Completed)
                return (parsed, false, true);

            return (parsed, true, false);
        }

        /// <summary>Splits an "A, B; C" assignment string into clean engineer names.</summary>
        private static IEnumerable<string> SplitEngineers(string? assignedEngineer)
        {
            if (string.IsNullOrWhiteSpace(assignedEngineer))
                return Array.Empty<string>();

            return assignedEngineer
                .Split(EngineerSeparators, StringSplitOptions.RemoveEmptyEntries)
                .Select(p => p.Trim())
                .Where(p => p.Length > 0 && !string.Equals(p, "Unassigned", StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Exact (case-insensitive) engineer match. Replaces the previous
        /// Contains() test that let "Ali" pull in "Alia" / "Ali Hassan" rows.
        /// </summary>
        private static bool IsAssignedTo(string? assignedEngineer, string engineerName)
        {
            if (string.IsNullOrWhiteSpace(engineerName)) return false;
            var target = engineerName.Trim();
            return SplitEngineers(assignedEngineer)
                .Any(part => string.Equals(part, target, StringComparison.OrdinalIgnoreCase));
        }

        #endregion

        #region Rate / bucket calculation (FIX #4/#5/#6/#7: Division-Based, Averaged, 2dp-rounded duration, NO cap)

        /// <summary>
        /// Mutually exclusive completion buckets with per-task rate collection.
        /// INVARIANT (FIX #1): CompletedCount == EarlyCount + ExactlyOnTimeCount + DelayedCount.
        ///
        /// FIX #5/#7: Now collects per-task rates using
        ///     (targetDurationDays / actualDurationDays) × 100
        /// where BOTH durations are rounded to 2 decimal places (matching
        /// datetime-utils.ts's durationInDays), and NO upper cap is applied
        /// (matching calculateRatioRate() which has no MAX_RATE_PERCENT enforcement).
        /// </summary>
        private sealed class CompletionStats
        {
            public int CompletedCount { get; set; }
            /// <summary>Finished strictly BEFORE the target date (calendar-day bucket rule).</summary>
            public int EarlyCount { get; set; }
            /// <summary>Finished exactly ON the target date, or has no usable target/actual date.</summary>
            public int ExactlyOnTimeCount { get; set; }
            /// <summary>Finished AFTER the target date (calendar-day bucket rule).</summary>
            public int DelayedCount { get; set; }

            /// <summary>
            /// Per-task rate for every EARLY task: max((Target Duration / Actual Duration) * 100, 100),
            /// with both durations rounded to 2 decimal places. NO UPPER CAP.
            /// The Early Rate is the AVERAGE of this list.
            /// </summary>
            public List<double> EarlyRates { get; } = new List<double>();

            /// <summary>
            /// Per-task rate for every DELAYED task: min((Target Duration / Actual Duration) * 100, 100),
            /// with both durations rounded to 2 decimal places.
            /// The Delay Rate is the AVERAGE of this list.
            /// </summary>
            public List<double> DelayedRates { get; } = new List<double>();

            /// <summary>
            /// Tasks that MET the target (Early + ExactlyOnTime).
            /// Used ONLY for the On-Time Rate, never as a display bucket, so the
            /// Early column is not double counted inside the On-Time column.
            /// </summary>
            public int MetTargetCount => EarlyCount + ExactlyOnTimeCount;
            public int TotalEarlyDays { get; set; }
            public int TotalDelayDaysRaw { get; set; }
        }

        private sealed class RateSet
        {
            public double OnTimeRate { get; set; }
            public double DelayRate { get; set; }
            public double EarlyRate { get; set; }
            public double EarlyBonusRate { get; set; }
            public double CapacityEfficiencyRate { get; set; }
            public string EfficiencyRating { get; set; } = "No Data";
            public bool RateExceedsTarget { get; set; }

            // ===== NEW: rate SAMPLE sizes (consumed by PerformanceController) =====
            // The Early / Delay Rate are AVERAGES, so the "Overall Total" row must be a
            // WEIGHTED average over these sample sizes — never over the bucket counts.
            // A task whose target duration is <= 0 is excluded from the average (parity
            // with calculateRatioRate() returning null in completed-task-metrics.ts),
            // therefore EarlyRateSampleCount <= EarlyCount can legitimately hold.
            public int EarlyRateSampleCount { get; set; }
            public int DelayedRateSampleCount { get; set; }
        }

        /// <summary>
        /// Classifies every completed task EXACTLY ONCE into Early / ExactlyOnTime / Delayed
        /// (calendar-day bucket rule, matching getCompletionDayDelta() in the frontend) and
        /// collects per-task rates using the division-based model with 2-DECIMAL-PLACE durations:
        ///
        ///     Rate = (targetDurationDays / actualDurationDays) × 100
        ///
        /// FIX #5 (AMENDED): targetDurationDays / actualDurationDays are now rounded to
        /// 2 decimal places using: Math.Floor(x * 100 + 0.5) / 100
        /// This matches datetime-utils.ts's durationInDays():
        ///     Math.round(((b - a) / 86400000) * 100) / 100
        ///
        /// FIX #7 (NEW): NO upper cap on early rates. The frontend's calculateRatioRate()
        /// does not apply any MAX_RATE_PERCENT cap — values like 2006.62% are legitimate.
        /// Tasks with targetDurationDays <= 0 are SKIPPED from rate calculation (the
        /// frontend returns null and excludes them from the average).
        /// </summary>
        private static CompletionStats BuildCompletionStats(IEnumerable<CompletedTask> completedTasks)
        {
            var stats = new CompletionStats();

            foreach (var ct in completedTasks)
            {
                stats.CompletedCount++;

                var actual = ct.EngineerCompletedAt ?? ct.ActualCompletionDate;
                var target = ct.TargetCompletionDate;

                // ===== FIX #1 + FIX #3 =====
                // No target date to breach => the task counts as "target met" (On-Time bucket).
                if (!actual.HasValue || !target.HasValue)
                {
                    stats.ExactlyOnTimeCount++;
                    continue;
                }

                // Bucket classification stays calendar-day based (UTC day delta), matching
                // the frontend's getCompletionDayDelta(): variance > 0 => early,
                // == 0 => on target day, < 0 => delayed.
                var variance = (target.Value.Date - actual.Value.Date).Days;

                // ===== FIX #5 (AMENDED): 2-decimal-place rounded durations =====
                // Matches datetime-utils.ts durationInDays():
                //   Math.round(((b - a) / 86400000) * 100) / 100
                var start = ct.TaskAssignedAt ?? ct.TaskCreatedAt;
                var rawTargetDays = (target.Value - start).TotalDays;
                var rawActualDays = (actual.Value - start).TotalDays;

                // Round to 2 decimal places using the same logic as JS Math.round:
                // Math.Floor(x * 100 + 0.5) / 100 is equivalent to Math.round(x * 100) / 100
                var targetDurationDays = Math.Floor(rawTargetDays * 100.0 + 0.5) / 100.0;
                var actualDurationDays = Math.Floor(rawActualDays * 100.0 + 0.5) / 100.0;

                // ===== FIX #7: Skip rate when target <= 0 =====
                // Matches frontend calculateRatioRate() which returns null when
                // targetDurationDays <= 0, excluding the task from rate averages entirely.
                bool canComputeRate = targetDurationDays > 0;

                // Safe actual floor matches frontend: actualDurationDays > 0.01 ? actual : 0.01
                var safeActualDuration = actualDurationDays > MIN_SAFE_DURATION_DAYS
                    ? actualDurationDays
                    : MIN_SAFE_DURATION_DAYS;

                if (variance > 0)
                {
                    // EARLY: completed before target date
                    stats.EarlyCount++;
                    stats.TotalEarlyDays += variance;

                    if (canComputeRate)
                    {
                        // Per-task rate = (targetDuration / actualDuration) × 100
                        // For early tasks: always >= 100% (completed faster than allowed)
                        var rate = (targetDurationDays / safeActualDuration) * 100.0;
                        rate = Math.Max(rate, 100.0); // Floor at 100%
                        // ===== FIX #7: NO UPPER CAP =====
                        // The frontend calculateRatioRate() has NO cap. Removing the previous
                        // Math.Min(rate, MAX_TASK_RATE_PERCENT) ensures values like 2006.62%
                        // are preserved, matching the Completed Tasks view exactly.
                        stats.EarlyRates.Add(Round2(rate));
                    }
                }
                else if (variance == 0)
                {
                    // ON-TIME: completed exactly on target date
                    stats.ExactlyOnTimeCount++;
                }
                else
                {
                    // DELAYED: completed after target date
                    stats.DelayedCount++;
                    stats.TotalDelayDaysRaw += Math.Abs(variance);

                    if (canComputeRate)
                    {
                        // Per-task rate = (targetDuration / actualDuration) × 100
                        // For delayed tasks: always <= 100% (took longer than allowed)
                        var rate = (targetDurationDays / safeActualDuration) * 100.0;
                        rate = Math.Min(rate, 100.0); // Cap at 100%
                        rate = Math.Max(rate, 0.0); // Floor at 0%
                        stats.DelayedRates.Add(Round2(rate));
                    }
                }
            }

            // Safety net: the three display buckets MUST always add up to Completed.
            var classified = stats.EarlyCount + stats.ExactlyOnTimeCount + stats.DelayedCount;
            if (classified < stats.CompletedCount)
                stats.ExactlyOnTimeCount += stats.CompletedCount - classified;

            return stats;
        }

        /// <summary>
        /// Builds every percentage exposed to the UI using the Division-Based, Averaged model.
        ///
        /// FIX #6: OnTimeRate now matches the on-screen legend EXACTLY:
        ///     "100% when one or more tasks are completed exactly on the target date,
        ///      otherwise 0.00%."
        ///
        ///   Early Rate  = AVERAGE of per-task early rates (each >= 100%, NO CAP)
        ///   Delay Rate  = AVERAGE of per-task delayed rates (each <= 100%)
        ///   On-Time Rate= 100.00% when ExactlyOnTimeCount > 0, else 0
        ///   Efficiency  = (Early Rate + Delay Rate + On-Time Rate) / 3,
        ///                 with an empty category counted as a neutral 100%
        /// </summary>
        private static RateSet BuildRates(CompletionStats stats)
        {
            var completed = stats.CompletedCount;

            // ===== FIX #6: On-Time Rate — 100% ONLY when at least one task landed exactly
            // on the target date. No other condition grants 100%. =====
            var onTimeRate = stats.ExactlyOnTimeCount > 0 ? 100.0 : 0.0;

            // Early Rate: AVERAGE of per-task early rates (NO CAP — values can exceed 1000%)
            var earlyRate = stats.EarlyRates.Count > 0
                ? Round2(stats.EarlyRates.Sum() / stats.EarlyRates.Count)
                : 0.0;

            // Delay Rate: AVERAGE of per-task delayed rates
            var delayRate = stats.DelayedRates.Count > 0
                ? Round2(stats.DelayedRates.Sum() / stats.DelayedRates.Count)
                : 0.0;

            // Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3
            // An empty category counts as a neutral 100%
            var effEarly = stats.EarlyRates.Count > 0 ? earlyRate : NEUTRAL_RATE_PERCENT;
            var effDelay = stats.DelayedRates.Count > 0 ? delayRate : NEUTRAL_RATE_PERCENT;
            var effOnTime = stats.ExactlyOnTimeCount > 0 ? onTimeRate : NEUTRAL_RATE_PERCENT;
            var efficiency = Round2((effEarly + effDelay + effOnTime) / EFFICIENCY_COMPONENTS);

            // EarlyBonusRate is kept for backward compatibility but now represents
            // the excess above 100% in the early rate average
            var earlyBonusRate = earlyRate > 100.0 ? Round2(earlyRate - 100.0) : 0.0;

            return new RateSet
            {
                OnTimeRate = onTimeRate,
                DelayRate = delayRate,
                EarlyRate = earlyRate,
                EarlyBonusRate = earlyBonusRate,
                CapacityEfficiencyRate = efficiency,
                EfficiencyRating = GetEfficiencyRating(efficiency, completed),
                RateExceedsTarget = earlyRate > 100 || efficiency > 100,
                // ===== NEW: expose the sample sizes behind the two averages =====
                EarlyRateSampleCount = stats.EarlyRates.Count,
                DelayedRateSampleCount = stats.DelayedRates.Count
            };
        }

        private static string GetEfficiencyRating(double efficiency, int completedCount)
        {
            if (completedCount <= 0) return "No Data";
            if (efficiency > 100) return "Outstanding";
            if (efficiency >= 85) return "Excellent";
            if (efficiency >= 70) return "Good";
            if (efficiency >= 50) return "Fair";
            return "Needs Improvement";
        }

        private static double Round2(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return 0;
            return Math.Round(value, 2, MidpointRounding.AwayFromZero);
        }

        #endregion

        #region Private Helper Methods

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

        /// <summary>
        /// Calculate total delay days accounting for date transfers from hold requests
        /// </summary>
        private async Task<int> CalculateTotalDelayDaysWithTransfersAsync(
            string engineerName,
            List<CompletedTask> completedTasks,
            DateTime? startDate,
            DateTime? endDate)
        {
            var engineer = await _context.Users
                .FirstOrDefaultAsync(u => u.FullName == engineerName);

            if (engineer == null)
            {
                return completedTasks
                    .Where(ct => ct.ActualCompletionDate.HasValue && ct.TargetCompletionDate.HasValue)
                    .Sum(ct =>
                    {
                        var delay = (ct.ActualCompletionDate!.Value.Date - ct.TargetCompletionDate!.Value.Date).Days;
                        return Math.Max(0, delay);
                    });
            }

            var dateCountsQuery = _context.Set<UserDateCount>()
                .Where(udc => udc.UserId == engineer.UserId && udc.RecordStatus == RecordStatus.Active);

            if (startDate.HasValue)
                dateCountsQuery = dateCountsQuery.Where(udc => udc.CreatedAt >= startDate.Value);
            if (endDate.HasValue)
                dateCountsQuery = dateCountsQuery.Where(udc => udc.CreatedAt <= endDate.Value);

            var dateCounts = await dateCountsQuery.ToListAsync();

            var baseDelayDays = completedTasks
                .Where(ct => ct.ActualCompletionDate.HasValue && ct.TargetCompletionDate.HasValue)
                .Sum(ct =>
                {
                    var delay = (ct.ActualCompletionDate!.Value.Date - ct.TargetCompletionDate!.Value.Date).Days;
                    return Math.Max(0, delay);
                });

            var transferredAwayDays = dateCounts
                .Where(dc => dc.DateCount == 0 && dc.EndDate.HasValue)
                .Sum(dc =>
                {
                    var holdRequest = _context.Set<TaskHoldRequest>()
                        .FirstOrDefault(hr => hr.TaskId == dc.TaskId &&
                                            hr.RequestedByEngineerId == engineer.UserId &&
                                            hr.Status == "Approved" &&
                                            hr.ActionTaken == "TransferredToTL");
                    return holdRequest?.DaysWorkedByEngineer ?? 0;
                });

            var adjustedDelayDays = Math.Max(0, baseDelayDays - transferredAwayDays);

            _logger.LogInformation(
                "Delay calculation for {EngineerName}: Base={BaseDelay}, Transferred={Transferred}, Adjusted={Adjusted}",
                engineerName, baseDelayDays, transferredAwayDays, adjustedDelayDays);

            return adjustedDelayDays;
        }

        #endregion
    }
}