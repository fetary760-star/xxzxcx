using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace CMT.Web.Api.Controllers
{
    /// <summary>
    /// PERFORMANCE CONTROLLER — AMENDED (data-consistency fix)
    ///
    /// ===========================================================================
    /// THE ROOT CAUSE OF THE REPORTED MISMATCH
    /// ===========================================================================
    /// For Mahlet Lemma (07/01/2026 → 07/31/2026) the Completed Tasks view showed
    ///
    ///     Early Rate 2006.62% | On-Time Rate 100.00% | Delay Rate 59.84% | Efficiency 722.15%
    ///
    /// while the Performance Summary showed
    ///
    ///     Early Rate 1629.45% | On-Time Rate 100.00% | Delay Rate 61.51% | Efficiency 596.99%
    ///
    /// The COUNTS (53 completed = 27 early + 17 on-time + 9 delayed) already matched,
    /// which proves the classification was never the problem. The RATES differed
    /// because `task_breakdown` below serialised ONLY a subset of TaskBreakdownDto:
    ///
    ///     task_id, description, status, category_name, priority_name,
    ///     created_at, target_completion_date, actual_completion_date,
    ///     delay_days, is_on_time
    ///
    /// `task_assigned_at`, `engineer_completed_at`, `tl_approval_date` and
    /// `category_id` were DROPPED. The frontend rate pipeline
    /// (completed-task-metrics.ts → getVarianceStart()) therefore silently fell
    /// back to `created_at`, so BOTH durations were measured from Task CREATED At
    /// instead of Task ASSIGNED At. Adding the same constant
    /// C = (assignedAt − createdAt) to both sides of
    ///
    ///     rate = (Target − start) / (Actual − start) × 100
    ///
    /// pulls every ratio towards 100%, which lowers the Early Rate
    /// (2006.62% → 1629.45%) and raises the Delay Rate (59.84% → 61.51%), exactly
    /// the reported symptom.
    ///
    /// ===========================================================================
    /// FIX #A (THE ACTUAL FIX) — full task-row projection
    /// ===========================================================================
    /// `task_breakdown` now emits EVERY field the shared rate pipeline needs:
    ///     category_id, task_assigned_at, engineer_completed_at, tl_approval_date
    ///     and the already-resolved effective_target_completion_date.
    /// The Performance Summary, the View Details dialog and both exports therefore
    /// measure the SAME durations as the Completed Tasks view and its Excel export.
    ///
    /// FIX #B — overall_summary uses the SAME Division-Based, Averaged model
    ///     On-Time Rate = 100.00% when one or more tasks landed exactly on target
    ///     Early Rate   = WEIGHTED AVERAGE of the per-engineer early rates
    ///                    (weighted by early_rate_sample_count — mathematically
    ///                     identical to averaging every per-task rate at once)
    ///     Delay Rate   = WEIGHTED AVERAGE of the per-engineer delayed rates
    ///     Efficiency   = (Early Rate + Delay Rate + On-Time Rate) / 3,
    ///                    an EMPTY category counting as a neutral 100%
    /// The previous count-based `+ early_bonus_rate` formula could never reproduce
    /// 2006.62% / 722.15% and is removed.
    ///
    /// FIX #C — sample counts are exposed (early_rate_sample_count /
    ///     delayed_rate_sample_count / rate_on_time_count) so the grid footer and
    ///     both exports can build a CORRECT weighted overall row instead of
    ///     re-deriving it from bucket counts.
    ///
    /// FIX #D — BOTH date bounds are documented and echoed as
    ///     "Task Assigned At", never "Engineer Completed At".
    /// </summary>
    [ApiController]
    [Route("api/performance")]
    [Authorize]
    public class PerformanceController : ControllerBase
    {
        /// <summary>Efficiency is the average of the three cumulative rates.</summary>
        private const int EFFICIENCY_COMPONENTS = 3;

        /// <summary>An empty Early / Delayed / On-Time category counts as a neutral 100%.</summary>
        private const double NEUTRAL_RATE_PERCENT = 100.0;

        private readonly IPerformanceService _performanceService;
        private readonly ILogger<PerformanceController> _logger;

        public PerformanceController(
            IPerformanceService performanceService,
            ILogger<PerformanceController> logger)
        {
            _performanceService = performanceService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult> GetPerformanceMetrics(
            [FromQuery] string[]? engineer = null,
            [FromQuery] int? category = null,
            [FromQuery] int? priority = null,
            [FromQuery] int? shop = null,
            [FromQuery] string? status = null,
            [FromQuery] DateTime? start_date = null,
            [FromQuery] DateTime? end_date = null)
        {
            try
            {
                // Sanitise the engineer filter: "?engineer=" or "?engineer=all" used to
                // become a non-empty array that matched nothing (or everything) and
                // produced mismatching export rows.
                var engineerFilter = (engineer ?? Array.Empty<string>())
                    .Where(e => !string.IsNullOrWhiteSpace(e))
                    .Select(e => e.Trim())
                    .Where(e => !string.Equals(e, "all", StringComparison.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();

                var normalizedStatus = string.IsNullOrWhiteSpace(status) ? null : status.Trim();

                _logger.LogInformation(
                    "Getting performance metrics - Engineers: {Engineers}, Category: {Category}, Priority: {Priority}, Shop: {Shop}, Status: {Status}, TaskAssignedAt from {StartDate} to {EndDate}",
                    engineerFilter.Length > 0 ? string.Join(", ", engineerFilter) : "All",
                    category?.ToString() ?? "All",
                    priority?.ToString() ?? "All",
                    shop?.ToString() ?? "All",
                    normalizedStatus ?? "All",
                    start_date?.ToString("yyyy-MM-dd") ?? "N/A",
                    end_date?.ToString("yyyy-MM-dd") ?? "N/A");

                var performanceData = await _performanceService.GetEngineerPerformanceAsync(
                    engineerNames: engineerFilter.Length > 0 ? engineerFilter : null,
                    categoryId: category,
                    priorityId: priority,
                    shopId: shop,
                    status: normalizedStatus,
                    startDate: start_date,
                    endDate: end_date);

                // Generate chart data from real performance data
                var chartLabels = performanceData.Select(p => p.EngineerName).ToList();
                var chartDataCompleted = performanceData.Select(p => p.CompletedTasksCount).ToList();
                var chartDataOnTime = performanceData.Select(p => p.OnTimeCompletedCount).ToList();
                var chartDataEarly = performanceData.Select(p => p.EarlyCompletedCount).ToList();
                var chartDataDelayed = performanceData.Select(p => p.DelayedCompletedCount).ToList();
                var chartDataDelayDays = performanceData.Select(p => p.TotalDelayDays).ToList();

                // ===== OVERALL TOTALS (summary footer row) =====
                var totalCompletedAll = performanceData.Sum(p => p.CompletedTasksCount);
                var totalOnTimeAll = performanceData.Sum(p => p.OnTimeCompletedCount);
                var totalEarlyAll = performanceData.Sum(p => p.EarlyCompletedCount);
                var totalDelayedAll = performanceData.Sum(p => p.DelayedCompletedCount);
                var totalMetTargetAll = performanceData.Sum(p => p.MetTargetCount);

                // ===== FIX #B/#C: WEIGHTED averages over the per-task rate samples =====
                // Weighting by the SAMPLE counts is mathematically identical to averaging
                // every underlying per-task rate at once, so the footer row reconciles
                // with the task-level data and with the Completed Tasks export.
                var earlySampleAll = performanceData.Sum(p => p.EarlyRateSampleCount);
                var delayedSampleAll = performanceData.Sum(p => p.DelayedRateSampleCount);
                var rateOnTimeCountAll = performanceData.Sum(p => p.ExactlyOnTimeCount);

                var overallEarlyRate = earlySampleAll > 0
                    ? Round2(performanceData.Sum(p => p.EarlyRate * p.EarlyRateSampleCount) / earlySampleAll)
                    : 0.0;
                var overallDelayRate = delayedSampleAll > 0
                    ? Round2(performanceData.Sum(p => p.DelayRate * p.DelayedRateSampleCount) / delayedSampleAll)
                    : 0.0;

                // On-Time Rate legend: 100% when one or more tasks are completed exactly
                // on the target date, otherwise 0.00%.
                var overallOnTimeRate = rateOnTimeCountAll > 0 ? 100.0 : 0.0;

                var overallEfficiencyRate = Efficiency(
                    overallEarlyRate, overallDelayRate, overallOnTimeRate,
                    earlySampleAll, delayedSampleAll, rateOnTimeCountAll);

                var overallEarlyBonusRate = overallEarlyRate > 100.0
                    ? Round2(overallEarlyRate - 100.0)
                    : 0.0;

                var result = new
                {
                    summary_table_data = performanceData.Select(p => new
                    {
                        engineer_name = p.EngineerName,
                        total_assigned_tasks = p.TotalAssignedTasks,
                        completed_tasks_count = p.CompletedTasksCount,
                        // Exclusive buckets -> early + on_time + delayed == completed
                        early_completed_count = p.EarlyCompletedCount,
                        on_time_completed_count = p.OnTimeCompletedCount,
                        delayed_completed_count = p.DelayedCompletedCount,
                        exactly_on_time_count = p.ExactlyOnTimeCount,
                        // early + on_time (tasks delivered within target)
                        met_target_count = p.MetTargetCount,
                        // ===== FIX #C: rate sample counts for a correct weighted overall row =====
                        early_rate_sample_count = p.EarlyRateSampleCount,
                        delayed_rate_sample_count = p.DelayedRateSampleCount,
                        rate_on_time_count = p.ExactlyOnTimeCount,
                        // Reconciliation flag consumed by the UI/export sanity check
                        buckets_reconciled = (p.EarlyCompletedCount + p.OnTimeCompletedCount + p.DelayedCompletedCount)
                                             == p.CompletedTasksCount,
                        total_delay_days = p.TotalDelayDays,
                        total_early_days = p.TotalEarlyDays,
                        on_time_rate = p.OnTimeRate,
                        delay_rate = p.DelayRate,
                        early_rate = p.EarlyRate,
                        early_bonus_rate = p.EarlyBonusRate,
                        capacity_efficiency_rate = p.CapacityEfficiencyRate,
                        efficiency_rating = p.EfficiencyRating,
                        rate_exceeds_target = p.RateExceedsTarget,
                        active_tasks = p.ActiveTasks,
                        pending_tasks = p.PendingTasks,
                        in_progress_tasks = p.InProgressTasks,
                        blocked_tasks = p.BlockedTasks,
                        on_hold_tasks = p.OnHoldTasks,
                        paused_tasks = p.PausedTasks,
                        rejected_tasks = p.RejectedTasks,
                        cancelled_tasks = p.CancelledTasks,
                        pending_tl_approval_tasks = p.PendingTLApprovalTasks
                    }).ToList(),
                    overall_summary = new
                    {
                        total_assigned_tasks = performanceData.Sum(p => p.TotalAssignedTasks),
                        completed_tasks_count = totalCompletedAll,
                        early_completed_count = totalEarlyAll,
                        on_time_completed_count = totalOnTimeAll,
                        delayed_completed_count = totalDelayedAll,
                        met_target_count = totalMetTargetAll,
                        early_rate_sample_count = earlySampleAll,
                        delayed_rate_sample_count = delayedSampleAll,
                        rate_on_time_count = rateOnTimeCountAll,
                        buckets_reconciled = (totalEarlyAll + totalOnTimeAll + totalDelayedAll) == totalCompletedAll,
                        total_delay_days = performanceData.Sum(p => p.TotalDelayDays),
                        total_early_days = performanceData.Sum(p => p.TotalEarlyDays),
                        on_time_rate = overallOnTimeRate,
                        delay_rate = overallDelayRate,
                        early_rate = overallEarlyRate,
                        early_bonus_rate = overallEarlyBonusRate,
                        capacity_efficiency_rate = overallEfficiencyRate,
                        efficiency_rating = GetEfficiencyRating(overallEfficiencyRate, totalCompletedAll),
                        rate_exceeds_target = overallEarlyRate > 100 || overallEfficiencyRate > 100
                    },
                    // Echo the filters actually applied, so the export can prove the file
                    // matches the selection. BOTH date bounds are Task Assigned At.
                    applied_filters = new
                    {
                        engineers = engineerFilter,
                        engineer_scope = engineerFilter.Length > 0 ? "selected" : "all",
                        category,
                        priority,
                        shop,
                        status = normalizedStatus ?? "all",
                        date_field = "task_assigned_at",
                        start_date = start_date?.ToString("yyyy-MM-dd"),
                        end_date = end_date?.ToString("yyyy-MM-dd")
                    },
                    rate_formulas = new
                    {
                        on_time_rate = "100% when one or more tasks are completed exactly on the target date, otherwise 0.00%",
                        early_rate = "AVERAGE of per-task (Target Duration / Actual Duration) x 100 — at least 100% per task, no upper cap",
                        delay_rate = "AVERAGE of per-task (Target Duration / Actual Duration) x 100 — at most 100% per task",
                        efficiency = "( Early Rate + Delay Rate + On-Time Rate ) / 3, empty category = neutral 100%",
                        duration_baseline = "task_assigned_at"
                    },
                    chart_labels = chartLabels,
                    chart_data_completed = chartDataCompleted,
                    chart_data_on_time = chartDataOnTime,
                    chart_data_early = chartDataEarly,
                    chart_data_delayed = chartDataDelayed,
                    chart_data_delay_days = chartDataDelayDays
                };

                _logger.LogInformation("Successfully retrieved performance metrics for {Count} engineers", performanceData.Count);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving performance metrics");
                return StatusCode(500, new
                {
                    message = "An error occurred while retrieving performance data",
                    error = ex.Message
                });
            }
        }

        [HttpGet("engineer/{engineerName}")]
        public async Task<ActionResult> GetEngineerDetailedPerformance(
            string engineerName,
            [FromQuery] int? category = null,
            [FromQuery] int? priority = null,
            [FromQuery] int? shop = null,
            [FromQuery] string? status = null,
            [FromQuery] DateTime? start_date = null,
            [FromQuery] DateTime? end_date = null)
        {
            try
            {
                var normalizedStatus = string.IsNullOrWhiteSpace(status) ? null : status.Trim();

                _logger.LogInformation(
                    "Getting detailed performance for engineer: {EngineerName}, Category: {Category}, Priority: {Priority}, Shop: {Shop}, Status: {Status}, TaskAssignedAt from {StartDate} to {EndDate}",
                    engineerName,
                    category?.ToString() ?? "All",
                    priority?.ToString() ?? "All",
                    shop?.ToString() ?? "All",
                    normalizedStatus ?? "All",
                    start_date?.ToString("yyyy-MM-dd") ?? "N/A",
                    end_date?.ToString("yyyy-MM-dd") ?? "N/A");

                var detailedPerformance = await _performanceService.GetEngineerDetailedPerformanceAsync(
                    engineerName: engineerName,
                    categoryId: category,
                    priorityId: priority,
                    shopId: shop,
                    status: normalizedStatus,
                    startDate: start_date,
                    endDate: end_date);

                var result = new
                {
                    engineer_name = detailedPerformance.EngineerName,
                    summary = new
                    {
                        total_assigned_tasks = detailedPerformance.TotalAssignedTasks,
                        completed_tasks_count = detailedPerformance.CompletedTasksCount,
                        early_completed_count = detailedPerformance.EarlyCompletedCount,
                        on_time_completed_count = detailedPerformance.OnTimeCompletedCount,
                        delayed_completed_count = detailedPerformance.DelayedCompletedCount,
                        exactly_on_time_count = detailedPerformance.ExactlyOnTimeCount,
                        met_target_count = detailedPerformance.MetTargetCount,
                        early_rate_sample_count = detailedPerformance.EarlyRateSampleCount,
                        delayed_rate_sample_count = detailedPerformance.DelayedRateSampleCount,
                        rate_on_time_count = detailedPerformance.ExactlyOnTimeCount,
                        buckets_reconciled = (detailedPerformance.EarlyCompletedCount
                                              + detailedPerformance.OnTimeCompletedCount
                                              + detailedPerformance.DelayedCompletedCount)
                                             == detailedPerformance.CompletedTasksCount,
                        total_delay_days = detailedPerformance.TotalDelayDays,
                        total_early_days = detailedPerformance.TotalEarlyDays,
                        average_delay_days = detailedPerformance.AverageDelayDays,
                        average_early_days = detailedPerformance.AverageEarlyDays,
                        on_time_rate = detailedPerformance.OnTimeRate,
                        delay_rate = detailedPerformance.DelayRate,
                        early_rate = detailedPerformance.EarlyRate,
                        early_bonus_rate = detailedPerformance.EarlyBonusRate,
                        capacity_efficiency_rate = detailedPerformance.CapacityEfficiencyRate,
                        efficiency_rating = detailedPerformance.EfficiencyRating,
                        rate_exceeds_target = detailedPerformance.RateExceedsTarget,
                        active_tasks = detailedPerformance.ActiveTasks,
                        pending_tasks = detailedPerformance.PendingTasks,
                        in_progress_tasks = detailedPerformance.InProgressTasks,
                        blocked_tasks = detailedPerformance.BlockedTasks,
                        on_hold_tasks = detailedPerformance.OnHoldTasks,
                        paused_tasks = detailedPerformance.PausedTasks,
                        rejected_tasks = detailedPerformance.RejectedTasks,
                        cancelled_tasks = detailedPerformance.CancelledTasks,
                        pending_tl_approval_tasks = detailedPerformance.PendingTLApprovalTasks
                    },

                    // ===================================================================
                    // FIX #A — THE ACTUAL FIX
                    // ===================================================================
                    // These 5 extra fields are what the frontend rate pipeline needs.
                    // Without task_assigned_at the client fell back to created_at and
                    // every rate drifted towards 100% (Early 2006.62% -> 1629.45%,
                    // Delay 59.84% -> 61.51%, Efficiency 722.15% -> 596.99%).
                    task_breakdown = detailedPerformance.TaskBreakdown.Select(t => new
                    {
                        task_id = t.TaskId,
                        description = t.Description,
                        status = t.Status,
                        serial_number = t.SerialNumber,
                        part_number = t.PartNumber,
                        // Category id is required by getTargetDaysValue() to resolve the
                        // configured Category Target Days fallback.
                        category_id = t.CategoryId,
                        category_name = t.CategoryName,
                        priority_name = t.PriorityName,
                        created_at = t.CreatedAt,
                        // THE duration baseline — Task Assigned At, NEVER Task Created At.
                        task_assigned_at = t.TaskAssignedAt,
                        assigned_at = t.TaskAssignedAt,
                        target_completion_date = t.TargetCompletionDate,
                        // Already-resolved effective (extension aware) deadline, so the
                        // client does not have to guess which target column to use.
                        effective_target_completion_date = t.TargetCompletionDate,
                        actual_completion_date = t.ActualCompletionDate,
                        // THE actual completion timestamp used by resolveActualCompletion().
                        engineer_completed_at = t.EngineerCompletedAt,
                        // Fallback actual-completion timestamp (TL approval instant).
                        tl_approval_date = t.TlApprovalDate,
                        delay_days = t.DelayDays,
                        is_on_time = t.IsOnTime
                    }).ToList(),
                    tasks_by_category = detailedPerformance.TasksByCategory,
                    tasks_by_priority = detailedPerformance.TasksByPriority,
                    applied_filters = new
                    {
                        engineer = engineerName,
                        category,
                        priority,
                        shop,
                        status = normalizedStatus ?? "all",
                        date_field = "task_assigned_at",
                        start_date = start_date?.ToString("yyyy-MM-dd"),
                        end_date = end_date?.ToString("yyyy-MM-dd")
                    }
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving detailed performance for engineer: {EngineerName}", engineerName);
                return StatusCode(500, new
                {
                    message = $"An error occurred while retrieving detailed performance for {engineerName}",
                    error = ex.Message
                });
            }
        }

        #region Helpers

        /// <summary>
        /// Efficiency = ( Early Rate + Delay Rate + On-Time Rate ) / 3, an EMPTY
        /// category counting as a neutral 100%. Worked example (Mahlet Lemma, 07/2026):
        ///     ( 2006.62 + 59.84 + 100 ) / 3 = 722.15
        /// </summary>
        private static double Efficiency(
            double earlyRate,
            double delayRate,
            double onTimeRate,
            int earlySampleCount,
            int delayedSampleCount,
            int onTimeCount)
        {
            var effEarly = earlySampleCount > 0 ? earlyRate : NEUTRAL_RATE_PERCENT;
            var effDelay = delayedSampleCount > 0 ? delayRate : NEUTRAL_RATE_PERCENT;
            var effOnTime = onTimeCount > 0 ? onTimeRate : NEUTRAL_RATE_PERCENT;
            return Round2((effEarly + effDelay + effOnTime) / EFFICIENCY_COMPONENTS);
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
    }
}