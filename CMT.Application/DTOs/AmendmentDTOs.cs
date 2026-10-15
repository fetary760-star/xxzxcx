using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    // AmendmentStatus enum for DTOs
    public enum AmendmentStatus
    {
        PendingTLReview,
        ForwardedToDirector,
        Approved,
        Rejected
    }

    public class AmendmentDto
    {
        public int TaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public AmendmentStatus Status { get; set; }
        public string RequestReason { get; set; } = string.Empty;
        public string ReviewNotes { get; set; } = string.Empty;
        public DateTime RequestedAt { get; set; }
        public DateTime? ReviewedAt { get; set; }
        public string RequesterName { get; set; } = string.Empty;
        public string ReviewerName { get; set; } = string.Empty;
        public int RequesterId { get; set; }
        public int? ReviewerId { get; set; }
        public bool RequiresDirectorApproval { get; set; }
    }

    // Enhanced DTOs for the new amendment system
    public class AmendmentRequestDto
    {
        public int AmendmentRequestId { get; set; }
        public int TaskId { get; set; }
        public int? OriginalTaskId { get; set; }
        public string TaskDescription { get; set; } = string.Empty;
        public string SerialNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string RequestReason { get; set; } = string.Empty;
        public string RequestType { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string PriorityLevel { get; set; } = string.Empty;
        
        // Requester info
        public int RequesterId { get; set; }
        public string RequesterName { get; set; } = string.Empty;
        public string RequesterRole { get; set; } = string.Empty;
        
        // Team Leader review
        public int? ReviewedByTlId { get; set; }
        public DateTime? TlReviewDate { get; set; }
        public string? TlReviewComments { get; set; }
        public string? TlDecision { get; set; }
        
        // Director review
        public int? ReviewedByDirectorId { get; set; }
        public DateTime? DirectorReviewDate { get; set; }
        public string? DirectorReviewComments { get; set; }
        public string? DirectorDecision { get; set; }
        
        // Resolution
        public string FinalStatus { get; set; } = string.Empty;
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedById { get; set; }
        
        // Timestamps
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        
        // Legacy compatibility
        public string ReviewerName { get; set; } = string.Empty;
        public int? ReviewerId { get; set; }
    }

    public class AmendmentAuditTrailDto
    {
        public int AuditId { get; set; }
        public int AmendmentRequestId { get; set; }
        public int TaskId { get; set; }
        public string ActionType { get; set; } = string.Empty;
        public int ActionByUserId { get; set; }
        public string ActionByUserName { get; set; } = string.Empty;
        public string ActionByRole { get; set; } = string.Empty;
        public string? PreviousStatus { get; set; }
        public string NewStatus { get; set; } = string.Empty;
        public string? ActionComments { get; set; }
        public DateTime ActionTimestamp { get; set; }
        public string? IpAddress { get; set; }
        public string? UserAgent { get; set; }
    }

    public class TaskStatusHistoryDto
    {
        public int HistoryId { get; set; }
        public int TaskId { get; set; }
        public int? OriginalTaskId { get; set; }
        public string? PreviousStatus { get; set; }
        public string NewStatus { get; set; } = string.Empty;
        public string? StatusChangeReason { get; set; }
        public int ChangedByUserId { get; set; }
        public string ChangedByUserName { get; set; } = string.Empty;
        public string ChangedByRole { get; set; } = string.Empty;
        public DateTime ChangeTimestamp { get; set; }
        public bool IsReopenAction { get; set; }
        public int ReopenCount { get; set; }
        public string? AssignedEngineers { get; set; }
        public int? RelatedAmendmentRequestId { get; set; }
    }
}