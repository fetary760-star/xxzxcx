using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Tool Need Analysis Report form.
    /// Corresponds to Excel sheet "25-" (TOOL NEED ANALYSIS REPORT).
    /// </summary>
    public class ToolNeedAnalysisReport
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(200)]
        public string ReportTitle { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string CMMReference { get; set; } = string.Empty;

        // Tool items stored as JSON array for multiple tool entries
        // Each item: { toolName, toolPartNumber, description, manufacturer, quantity, 
        //              status, calibrationRequired, calibrationInterval, storageLocation, remarks }
        public string ToolItemsJson { get; set; } = "[]";

        public int TotalToolsRequired { get; set; }
        public int ToolsAvailable { get; set; }
        public int ToolsOnOrder { get; set; }
        public int ToolsNeedingCalibration { get; set; }

        [MaxLength(2000)]
        public string Summary { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Recommendations { get; set; } = string.Empty;

        [MaxLength(200)]
        public string PreparedBy { get; set; } = string.Empty;

        public DateTime? PreparedDate { get; set; }

        [MaxLength(200)]
        public string ReviewedBy { get; set; } = string.Empty;

        public DateTime? ReviewedDate { get; set; }

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime? ApprovedDate { get; set; }

        // Approval workflow
        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord ATARecord { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}