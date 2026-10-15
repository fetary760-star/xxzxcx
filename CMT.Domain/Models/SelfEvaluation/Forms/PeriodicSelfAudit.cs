using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Periodic Capability Self-Audit form.
    /// Corresponds to Excel sheet "self audit form".
    /// Tracks periodic self-audit checklist items for capability assessment.
    /// </summary>
    public class PeriodicSelfAudit
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
        public string AuditTitle { get; set; } = string.Empty;

        public DateTime? AuditDate { get; set; }

        public DateTime? NextAuditDueDate { get; set; }

        [MaxLength(200)]
        public string AuditorName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string AuditorId { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ShopName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        // Audit checklist items stored as JSON for flexibility
        public string ChecklistItemsJson { get; set; } = "[]";

        public AuditStatus AuditStatus { get; set; } = AuditStatus.NotStarted;

        // Summary fields
        public int TotalItems { get; set; }
        public int CompliantItems { get; set; }
        public int NonCompliantItems { get; set; }
        public int NotApplicableItems { get; set; }

        [MaxLength(2000)]
        public string Findings { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string CorrectiveActions { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Recommendations { get; set; } = string.Empty;

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