using System.ComponentModel.DataAnnotations;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.DTOs
{
    public class DuplicateTaskDto
    {
        public int TaskId { get; set; }
        public string? SerialNumber { get; set; }
        public string? PartNumber { get; set; }
        public string? PoNumber { get; set; }
        public string Description { get; set; } = string.Empty;
        public int CategoryId { get; set; }
        public string? CategoryName { get; set; }
        public int? SubTypeId { get; set; }
        public string? SubTypeName { get; set; }
        public DomainTaskStatus Status { get; set; }
        public string? Comments { get; set; }
        public string AssignedEngineer { get; set; } = "Unassigned";
        public int PriorityId { get; set; }
        public string? PriorityName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public int CreatedBy { get; set; }
        public string? CreatedByName { get; set; }
        public bool IsDuplicate { get; set; }
        public string? DuplicateJustification { get; set; }
        
        // Additional fields for duplicate analysis
        public string? AttachmentPath { get; set; }
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public DateTime? ActualCompletionDate { get; set; }
        public DateTime? TargetCompletionDate { get; set; }
        public DateTime EstimatedCompletionDate { get; set; }
        
        // Duplicate-specific properties
        public double SimilarityScore { get; set; }
        public List<string> MatchingFields { get; set; } = new List<string>();
        public bool HasNotes { get; set; }
        public bool IsProcessed { get; set; }
    }

    public class DuplicateCheckRequest
    {
        // FIXED: Removed [Required] attributes to allow optional fields
        // At least one field should be provided for duplicate checking
        public string? SerialNumber { get; set; }
        public string? PartNumber { get; set; }
        public string? PoNumber { get; set; }
        public string? Description { get; set; }
        public int? CategoryId { get; set; }
        public int? SubTypeId { get; set; }
        public bool IncludeCompleted { get; set; } = false;
    }

    public class DuplicateCheckResponse
    {
        public bool IsDuplicate { get; set; }
        public List<DuplicateTaskDto> Duplicates { get; set; } = new List<DuplicateTaskDto>();
        public int TotalDuplicates { get; set; }
        public string Message { get; set; } = string.Empty;
        public DuplicateAnalysisResult Analysis { get; set; } = new DuplicateAnalysisResult();
    }

    public class DuplicateAnalysisResult
    {
        public int ExactMatches { get; set; }
        public int PartialMatches { get; set; }
        public int ActiveDuplicates { get; set; }
        public int CompletedDuplicates { get; set; }
        public List<string> RecommendedActions { get; set; } = new List<string>();
        public string RiskLevel { get; set; } = "Low"; // Low, Medium, High
    }

    public class ProcessDuplicateRequest
    {
        [Required]
        public List<int> TaskIds { get; set; } = new List<int>();
        [Required]
        public string Notes { get; set; } = string.Empty;
        [Required]
        public string Action { get; set; } = string.Empty; // "merge", "keep_separate", "mark_duplicate"
        public int? PrimaryTaskId { get; set; }
        public bool CreateAlert { get; set; } = true;
    }

    public class DuplicateFilterRequest
    {
        public bool ShowDuplicatesOnly { get; set; } = false;
        public string? DuplicateStatus { get; set; } // "unprocessed", "processed", "all"
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public int? CategoryId { get; set; }
        public string? SearchQuery { get; set; }
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 50;
        public bool IncludeCompleted { get; set; } = false;
    }

    public class DuplicateAlertDto
    {
        public int AlertId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string AlertType { get; set; } = "duplicate"; // duplicate, warning, info
        public string Severity { get; set; } = "medium"; // low, medium, high, critical
        public DateTime CreatedAt { get; set; }
        public bool IsRead { get; set; }
        public List<int> RelatedTaskIds { get; set; } = new List<int>();
        public string? ActionRequired { get; set; }
        public int CreatedBy { get; set; }
        public string? CreatedByName { get; set; }
    }

    // FIXED: Moved DuplicateStatistics to DTOs namespace to avoid ambiguity
    public class DuplicateStatistics
    {
        public int TotalDuplicates { get; set; }
        public int UnprocessedDuplicates { get; set; }
        public int ProcessedDuplicates { get; set; }
        public int DuplicateAlertsCount { get; set; }
        public double DuplicateRate { get; set; }
        public List<DuplicateTrend> MonthlyTrends { get; set; } = new List<DuplicateTrend>();
    }

    public class DuplicateTrend
    {
        public string Month { get; set; } = string.Empty;
        public int Count { get; set; }
        public double Percentage { get; set; }
    }
}