namespace CMT.Application.DTOs
{
    /// <summary>
    /// Row of the "Performance Summary" grid (Performance Management screen).
    ///
    /// AMENDMENT — bucket reconciliation + On-Time Rate
    ///   The three grid buckets are now MUTUALLY EXCLUSIVE, therefore:
    ///       CompletedTasksCount == EarlyCompletedCount
    ///                              + OnTimeCompletedCount
    ///                              + DelayedCompletedCount
    ///
    ///   OnTimeCompletedCount ("On-Time" column) = finished exactly ON the target date
    ///                                            (or the task has no target date).
    ///   EarlyCompletedCount  ("Early Tasks")    = finished BEFORE the target date.
    ///   DelayedCompletedCount("Delayed")        = finished AFTER the target date.
    ///
    ///   MetTargetCount (NEW) = EarlyCompletedCount + OnTimeCompletedCount, i.e. every
    ///   task delivered within the target. This is the numerator of OnTimeRate, so the
    ///   Early tasks are credited in the RATE without being double counted in the
    ///   COLUMNS.
    ///
    /// Rate definitions (percentages, 2 decimals):
    ///   OnTimeRate  = MetTargetCount / Completed * 100
    ///                 => exactly 100.00 whenever DelayedCompletedCount == 0.
    ///   DelayRate   = Delayed / Completed * 100
    ///   EarlyRate   = Early / Completed * 100 + EarlyBonusRate      (may exceed 100)
    ///   EarlyBonusRate = per task min(1, EarlyDays / TargetDurationDays)
    ///   CapacityEfficiencyRate = OnTimeRate + EarlyBonusRate        (may exceed 100)
    /// </summary>
    public class EngineerPerformanceDto
    {
        public string EngineerName { get; set; } = string.Empty;
        public int TotalAssignedTasks { get; set; }
        public int CompletedTasksCount { get; set; }

        // ===== Completion buckets (mutually exclusive: Early + OnTime + Delayed = Completed) =====
        /// <summary>Tasks finished strictly BEFORE the target date. ("Early Tasks" column)</summary>
        public int EarlyCompletedCount { get; set; }
        /// <summary>Tasks finished exactly ON the target date (or without a target date).</summary>
        public int ExactlyOnTimeCount { get; set; }
        /// <summary>"On-Time" column — EXCLUSIVE bucket, equals ExactlyOnTimeCount.</summary>
        public int OnTimeCompletedCount { get; set; }
        /// <summary>NEW: tasks that met the target = Early + On-Time. Numerator of OnTimeRate.</summary>
        public int MetTargetCount { get; set; }
        /// <summary>Tasks finished AFTER the target date.</summary>
        public int DelayedCompletedCount { get; set; }

        // ===== Day aggregates =====
        public int TotalDelayDays { get; set; }
        public int TotalEarlyDays { get; set; }

        // ===== Rate SAMPLE counts (FIX — required by PerformanceController) =====
        // The Early / Delay Rate are AVERAGES of per-task rates. A correct
        // "Overall Total" row therefore needs a WEIGHTED average, weighted by the
        // number of tasks that actually CONTRIBUTED a rate sample — NOT by the
        // bucket counts (a task whose target duration is <= 0 is excluded from the
        // rate average, exactly like the frontend's calculateRatioRate() returning
        // null). These two properties expose those sample sizes.

        /// <summary>EARLY tasks that produced a measurable (Target/Actual) rate sample.</summary>
        public int EarlyRateSampleCount { get; set; }

        /// <summary>DELAYED tasks that produced a measurable (Target/Actual) rate sample.</summary>
        public int DelayedRateSampleCount { get; set; }

        // ===== Rates =====
        public double OnTimeRate { get; set; }
        public double DelayRate { get; set; }
        public double EarlyRate { get; set; }
        public double EarlyBonusRate { get; set; }
        public double CapacityEfficiencyRate { get; set; }
        public string EfficiencyRating { get; set; } = "No Data";
        /// <summary>True when Early Rate / Efficiency go above 100% because of early delivery.</summary>
        public bool RateExceedsTarget { get; set; }

        // ===== Active workload =====
        public int ActiveTasks { get; set; }
        public int PendingTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int BlockedTasks { get; set; }
        public int OnHoldTasks { get; set; }
        public int PausedTasks { get; set; }
        public int RejectedTasks { get; set; }
        public int CancelledTasks { get; set; }
        public int PendingTLApprovalTasks { get; set; }
    }

    /// <summary>
    /// Detailed drill-down for a single engineer (View Details modal).
    /// Same bucket invariant as EngineerPerformanceDto.
    /// </summary>
    public class EngineerDetailedPerformanceDto
    {
        public string EngineerName { get; set; } = string.Empty;
        public int TotalAssignedTasks { get; set; }
        public int CompletedTasksCount { get; set; }

        public int EarlyCompletedCount { get; set; }
        public int ExactlyOnTimeCount { get; set; }
        public int OnTimeCompletedCount { get; set; }
        /// <summary>NEW: Early + On-Time (tasks delivered within the target).</summary>
        public int MetTargetCount { get; set; }
        public int DelayedCompletedCount { get; set; }

        public int TotalDelayDays { get; set; }
        public int TotalEarlyDays { get; set; }
        public double AverageDelayDays { get; set; }
        public double AverageEarlyDays { get; set; }

        public double OnTimeRate { get; set; }
        public double DelayRate { get; set; }
        public double EarlyRate { get; set; }
        public double EarlyBonusRate { get; set; }
        public double CapacityEfficiencyRate { get; set; }
        public string EfficiencyRating { get; set; } = "No Data";
        public bool RateExceedsTarget { get; set; }

        /// <summary>EARLY tasks that produced a measurable (Target/Actual) rate sample.</summary>
        public int EarlyRateSampleCount { get; set; }

        /// <summary>DELAYED tasks that produced a measurable (Target/Actual) rate sample.</summary>
        public int DelayedRateSampleCount { get; set; }

        public int ActiveTasks { get; set; }
        public int PendingTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int BlockedTasks { get; set; }
        public int OnHoldTasks { get; set; }
        public int PausedTasks { get; set; }
        public int RejectedTasks { get; set; }
        public int CancelledTasks { get; set; }
        public int PendingTLApprovalTasks { get; set; }

        public List<TaskBreakdownDto> TaskBreakdown { get; set; } = new List<TaskBreakdownDto>();
        public Dictionary<string, int> TasksByCategory { get; set; } = new Dictionary<string, int>();
        public Dictionary<string, int> TasksByPriority { get; set; } = new Dictionary<string, int>();
    }

    // Removed duplicate TaskBreakdownDto - using the one from WorkloadDTOs.cs
}