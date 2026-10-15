using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    /// <summary>
    /// DTO returned when querying workload adjustment requests.
    /// </summary>
    public class WorkloadAdjustmentRequestDto
    {
        public int AdjustmentRequestId { get; set; }
        public int TaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string AssignedEngineer { get; set; } = string.Empty;

        // Requester info
        public int RequesterId { get; set; }
        public string RequesterName { get; set; } = string.Empty;

        // Hours
        public decimal OriginalEstimatedHours { get; set; }

        /// <summary>
        /// The additional hours requested by the engineer (already converted to hours).
        /// This is the ADDITIONAL time, not the new total.
        /// </summary>
        public decimal RequestedEstimatedHours { get; set; }

        /// <summary>
        /// The new total estimated hours if the request is fully approved
        /// (OriginalEstimatedHours + RequestedEstimatedHours).
        /// </summary>
        public decimal NewTotalEstimatedHours => OriginalEstimatedHours + RequestedEstimatedHours;

        /// <summary>
        /// The raw value the engineer entered in the form (before unit conversion).
        /// For display purposes: e.g. "2" when RequestUnit is "days" and RequestedEstimatedHours is 14.5h.
        /// </summary>
        public decimal RequestedRawValue { get; set; }

        /// <summary>
        /// The unit used when the request was submitted: "hours" or "days".
        /// Stored for display purposes. Internally all values are stored in hours.
        /// </summary>
        public string RequestUnit { get; set; } = "hours";

        // Reason
        public string RequestReason { get; set; } = string.Empty;

        // Status
        public string Status { get; set; } = string.Empty;

        // TL Review
        public int? ReviewedByTlId { get; set; }
        public string? ReviewerName { get; set; }
        public DateTime? TlReviewDate { get; set; }
        public string? TlReviewComments { get; set; }

        /// <summary>
        /// The approved additional hours (already converted to hours).
        /// Null means the full requested amount was approved (or request was rejected).
        /// </summary>
        public decimal? ApprovedEstimatedHours { get; set; }

        /// <summary>
        /// The previous TargetCompletionDate before the adjustment was approved.
        /// Null if not yet reviewed or if rejected.
        /// </summary>
        public DateTime? PreviousTargetCompletionDate { get; set; }

        /// <summary>
        /// The new TargetCompletionDate after the adjustment was approved.
        /// Null if not yet reviewed or if rejected.
        /// </summary>
        public DateTime? NewTargetCompletionDate { get; set; }

        // Timestamps
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Request body for an engineer to create a workload adjustment request.
    /// Engineers request ADDITIONAL hours or days they need on top of the current estimate.
    /// Supports both hours and days as input units. When "days" is selected,
    /// the value is converted to hours using the EAT schedule (7.25 net hours/day).
    /// Example: Engineer requests 2 days → 2 × 7.25 = 14.5 additional hours.
    /// </summary>
    public class CreateWorkloadAdjustmentDto
    {
        [Required]
        public int TaskId { get; set; }

        /// <summary>
        /// The ADDITIONAL time requested in the unit specified by RequestUnit.
        /// This is the extra time the engineer needs, NOT the new total.
        /// If RequestUnit is "days", this is the number of additional working days.
        /// If RequestUnit is "hours" (default), this is the number of additional hours.
        /// Example: 2 (days) means 2 × 7.25 = 14.5 additional hours needed.
        /// </summary>
        [Required]
        [Range(0.5, 500, ErrorMessage = "Requested value must be between 0.5 and 500")]
        public decimal RequestedEstimatedHours { get; set; }

        /// <summary>
        /// The unit for the requested value: "hours" (default) or "days".
        /// When "days" is specified, the value is converted to hours using 7.25h/day (EAT schedule).
        /// </summary>
        [RegularExpression("^(hours|days)$", ErrorMessage = "RequestUnit must be 'hours' or 'days'")]
        public string RequestUnit { get; set; } = "hours";

        [Required]
        [StringLength(2000, MinimumLength = 10, ErrorMessage = "Reason must be between 10 and 2000 characters")]
        public string RequestReason { get; set; } = string.Empty;
    }

    /// <summary>
    /// Request body for a team leader to review (approve/reject) a workload adjustment request.
    /// </summary>
    public class ReviewWorkloadAdjustmentDto
    {
        [Required]
        [RegularExpression("^(approve|reject)$", ErrorMessage = "Decision must be 'approve' or 'reject'")]
        public string Decision { get; set; } = string.Empty;

        [StringLength(2000)]
        public string? ReviewComments { get; set; }

        /// <summary>
        /// Optional: TL can approve a different number of ADDITIONAL hours/days than what was requested.
        /// If null and decision is 'approve', the full requested additional hours are approved.
        /// The value represents ADDITIONAL time in the unit specified by ApprovedUnit.
        /// Example: 1.5 (days) = 1.5 × 7.25 = 10.875 additional hours approved.
        /// </summary>
        [Range(0.5, 500)]
        public decimal? ApprovedEstimatedHours { get; set; }

        /// <summary>
        /// The unit for the approved value: "hours" (default) or "days".
        /// When "days" is specified, the value is converted to hours using 7.25h/day (EAT schedule).
        /// </summary>
        [RegularExpression("^(hours|days)$", ErrorMessage = "ApprovedUnit must be 'hours' or 'days'")]
        public string ApprovedUnit { get; set; } = "hours";
    }
}