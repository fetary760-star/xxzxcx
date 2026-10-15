using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public class TaskHoldRequestDto
    {
        public int HoldRequestId { get; set; }
        public int TaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public int RequestedByEngineerId { get; set; }
        public string RequestedByEngineerName { get; set; } = string.Empty;
        public string HoldReason { get; set; } = string.Empty;
        public int DaysWorkedByEngineer { get; set; }
        public DateTime? AssignedDate { get; set; }
        public DateTime HoldRequestedDate { get; set; }
        public string Status { get; set; } = string.Empty;
        public int? ReviewedByTlId { get; set; }
        public string? ReviewedByTlName { get; set; }
        public DateTime? ReviewDate { get; set; }
        public string? ReviewComments { get; set; }
        public int? DaysTransferredToTl { get; set; }
        public string? ActionTaken { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// The date/time when the task status was last changed due to this hold request.
        /// </summary>
        public DateTime? StatusChangedAt { get; set; }
    }

    public class CreateTaskHoldRequestDto
    {
        [Required(ErrorMessage = "Hold reason is required")]
        public string HoldReason { get; set; } = string.Empty;
    }

    public class ReviewTaskHoldRequestDto
    {
        [Required(ErrorMessage = "Decision is required")]
        public string Decision { get; set; } = string.Empty; // "approve" or "reject"

        // FIXED: Removed [Required] attribute - validation is handled in controller
        // Action is only required when Decision is "approve", which is checked in the controller
        public string? Action { get; set; } // "transfer_to_tl", "return_to_initiator", "maintain_status"

        public string? ReviewComments { get; set; }
    }

    public class UserDateCountDto
    {
        public int DateCountId { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int TaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public int DateCount { get; set; }
        public string CountType { get; set; } = string.Empty;
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public int? TransferredFromUserId { get; set; }
        public string? TransferredFromUserName { get; set; }
        public string? TransferReason { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}