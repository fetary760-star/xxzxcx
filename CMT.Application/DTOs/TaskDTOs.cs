using System.ComponentModel.DataAnnotations;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using CMT.Domain.Models;
using CMT.Domain.Enums;

namespace CMT.Application.DTOs
{
    public class TaskDto
    {
        public int TaskId { get; set; }
        public string? SerialNumber { get; set; }
        public string? PartNumber { get; set; }
        public string? PoNumber { get; set; }
        public string Description { get; set; } = string.Empty;
        public int CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public int? SubTypeId { get; set; }
        public int? RequestTypeId { get; set; }
        public DomainTaskStatus Status { get; set; }
        public string? Comments { get; set; }
        public string AssignedEngineer { get; set; } = "Unassigned";
        public int? PriorityId { get; set; }
        public string? PriorityName { get; set; }
        public DateTime EstimatedCompletionDate { get; set; }
        public DateTime? TargetCompletionDate { get; set; }
        public DateTime? ActualCompletionDate { get; set; }
        public string? AttachmentPath { get; set; }
        public int? AttachmentsCount { get; set; }
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public string? PhoneExtension { get; set; }
        public string? EngineerPhoneNumber { get; set; }
        public int CreatedBy { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        /// <summary>
        /// The date/time when the task status was last changed.
        /// Null if the status has never been changed since creation.
        /// </summary>
        public DateTime? StatusChangedAt { get; set; }

        /// <summary>
        /// The date/time when the task was assigned to an engineer
        /// (i.e., AssignedEngineer was first changed from "Unassigned" to an actual engineer).
        /// Used as the baseline for variance / performance calculations instead of CreatedAt.
        /// </summary>
        public DateTime? AssignedAt { get; set; }

        // Amendment fields (already exist) - Using DTO AmendmentStatus
        public bool AmendmentRequest { get; set; } = false;
        public AmendmentStatus? AmendmentStatus { get; set; }
        public int? AmendmentReviewedByTlId { get; set; }
        public string? AmendmentReviewedByName { get; set; }

        // Reopened task fields - NEW
        public bool IsReopened { get; set; } = false;
        public int ReopenCount { get; set; } = 0;
        public int? ReopenedBy { get; set; }
        public string? ReopenedByName { get; set; }
        public DateTime? ReopenedAt { get; set; }
        public string? ReopenReason { get; set; }

        // FIXED: Add IsDuplicate field to TaskDto for proper display
        public bool IsDuplicate { get; set; } = false;
        public string? DuplicateJustification { get; set; }

        // FIXED: Add revision fields to TaskDto for proper display
        public string? RevisionNotes { get; set; }
        public bool ShowRevisionAlert { get; set; } = false;
    }

    public class CompletedTaskDto
    {
        public int CompletedTaskId { get; set; }
        public int OriginalTaskId { get; set; }
        public string? SerialNumber { get; set; }
        public string? PartNumber { get; set; }
        public string? PoNumber { get; set; }
        public string Description { get; set; } = string.Empty;
        public int CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public int? SubTypeId { get; set; }
        public int? RequestTypeId { get; set; }
        public DomainTaskStatus Status { get; set; }
        public string? Comments { get; set; }
        public string AssignedEngineer { get; set; } = "Unassigned";
        public int? PriorityId { get; set; }
        public string? PriorityName { get; set; }
        public DateTime EstimatedCompletionDate { get; set; }
        public DateTime? TargetCompletionDate { get; set; }
        public DateTime? ActualCompletionDate { get; set; }
        public string? AttachmentPath { get; set; }
        public int? AttachmentsCount { get; set; }
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public int CreatedBy { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime TaskCreatedAt { get; set; }
        public DateTime TaskUpdatedAt { get; set; }
        public DateTime CompletedAt { get; set; }
        public DateTime MovedToCompletedAt { get; set; }

        /// <summary>
        /// The date/time when the task was assigned to an engineer (copied from Task.AssignedAt).
        /// Used as the baseline for variance / performance calculations instead of TaskCreatedAt.
        /// </summary>
        public DateTime? TaskAssignedAt { get; set; }

        /// <summary>
        /// The date/time when the engineer marked the task as completed
        /// (i.e., selected "Completed" from the status dropdown and saved changes).
        /// This is recorded at the PendingTLApproval step.
        /// </summary>
        public DateTime? EngineerCompletedAt { get; set; }

        /// <summary>
        /// The date/time when the Team Leader approved the completion.
        /// This is the same as MovedToCompletedAt / CompletedAt (set when MoveTaskToCompletedAsync runs).
        /// Exposed explicitly for clarity in the UI.
        /// </summary>
        public DateTime? TlApprovalDate { get; set; }

        // Amendment fields (already exist) - Using DTO AmendmentStatus
        public bool AmendmentRequest { get; set; } = false;
        public AmendmentStatus? AmendmentStatus { get; set; }
        public int? AmendmentReviewedByTlId { get; set; }
        public string? AmendmentReviewedByName { get; set; }

        // Reopened task fields - NEW
        public bool IsReopened { get; set; } = false;
        public int ReopenCount { get; set; } = 0;
        public int? ReopenedBy { get; set; }
        public string? ReopenedByName { get; set; }
        public DateTime? ReopenedAt { get; set; }
        public string? ReopenReason { get; set; }

        // FIXED: Add IsDuplicate field to CompletedTaskDto for proper display
        public bool IsDuplicate { get; set; } = false;
        public string? DuplicateJustification { get; set; }

        // FIXED: Add revision fields to CompletedTaskDto for proper display
        public string? RevisionNotes { get; set; }
        public bool ShowRevisionAlert { get; set; } = false;

        // Status indicators - NEW
        public string StatusIndicator => GetStatusIndicator();

        private string GetStatusIndicator()
        {
            var indicators = new List<string>();
            
            if (IsReopened && ReopenCount > 0)
                indicators.Add($"Reopened ({ReopenCount}x)");
            
            if (AmendmentRequest)
                indicators.Add($"Amendment: {AmendmentStatus}");

            return string.Join(" | ", indicators);
        }
    }

    public class CreateTaskDto
    {
        // FIXED: Serial Number is now optional - removed [Required] attribute
        [StringLength(100)]
        public string? SerialNumber { get; set; }

        [Required(ErrorMessage = "Part Number is required")]
        [StringLength(100)]
        public string PartNumber { get; set; } = string.Empty;

        [StringLength(100)]
        public string? PoNumber { get; set; }

        [Required(ErrorMessage = "Description is required")]
        public string Description { get; set; } = string.Empty;

        [Required(ErrorMessage = "Category Type is required")]
        public int CategoryId { get; set; }

        [Required(ErrorMessage = "Sub Type is required")]
        public int SubTypeId { get; set; }

        public int? RequestTypeId { get; set; }
        public DomainTaskStatus Status { get; set; } = DomainTaskStatus.Pending;
        public string? Comments { get; set; }

        [StringLength(255)]
        public string AssignedEngineer { get; set; } = "Unassigned";

        public int? PriorityId { get; set; } // Default: None (no priority)

        public DateTime EstimatedCompletionDate { get; set; } = DateTime.Now;

        public DateTime? TargetCompletionDate { get; set; }
        public string? AttachmentPath { get; set; }
        
        // FIXED: ShopId should be automatically populated from the creator's shop assignment
        public int? ShopId { get; set; }

        [Required]
        public int CreatedBy { get; set; }

        // FIXED: Add duplicate detection fields to CreateTaskDto
        public bool IsDuplicate { get; set; } = false;
        public string? DuplicateJustification { get; set; }
    }

    public class UpdateTaskDto
    {
        [StringLength(100)]
        public string? SerialNumber { get; set; }

        [StringLength(100)]
        public string? PartNumber { get; set; }

        [StringLength(100)]
        public string? PoNumber { get; set; }

        [Required]
        public string Description { get; set; } = string.Empty;

        [Required]
        public int CategoryId { get; set; }

        public int? SubTypeId { get; set; }
        public int? RequestTypeId { get; set; }
        public DomainTaskStatus Status { get; set; }
        public string? Comments { get; set; }

        [StringLength(255)]
        public string AssignedEngineer { get; set; } = "Unassigned";

        public int? PriorityId { get; set; }

        // FIXED: Remove [Required] from EstimatedCompletionDate for updates - use existing value if not provided
        public DateTime? EstimatedCompletionDate { get; set; }

        public DateTime? TargetCompletionDate { get; set; }
        public DateTime? ActualCompletionDate { get; set; }
        public string? AttachmentPath { get; set; }
        public int? ShopId { get; set; }

        // FIXED: Properly handle revision notes and alert fields
        public string? RevisionNotes { get; set; }
        public int? ShowRevisionAlert { get; set; }
        public string? UpdateComment { get; set; }
        public object? _editor { get; set; }

        // FIXED: Add duplicate detection fields to UpdateTaskDto
        public bool IsDuplicate { get; set; } = false;
        public string? DuplicateJustification { get; set; }
    }

    public class TaskFilterDto
    {
        public int? ShopId { get; set; }
        public int? CreatedBy { get; set; }
        public DomainTaskStatus? Status { get; set; }
        public int? PriorityId { get; set; }
        public int? CategoryId { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string? SearchQuery { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 50;
    }

    // NEW DTOs for reopening tasks and amendment review
    public class ReopenTaskDto
    {
        [Required]
        public string Status { get; set; } = "Pending";
        
        [Required]
        public string ReopenReason { get; set; } = "";
        
        [Required]
        public List<string> AssignedEngineer { get; set; } = new List<string>();
    }

    public class AmendmentReviewDto
    {
        [Required]
        public AmendmentStatus Status { get; set; }
        
        public string? ReviewComments { get; set; }
    }

    public class RequestAmendmentDto
    {
        [Required]
        public string AmendmentReason { get; set; } = string.Empty;
    }
}