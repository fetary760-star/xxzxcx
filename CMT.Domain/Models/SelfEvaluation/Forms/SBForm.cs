using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Service Bulletin Form - tracks SB compliance and applicability.
    /// Corresponds to Excel sheet "SB".
    /// </summary>
    public class SBForm
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [Required]
        [MaxLength(100)]
        public string SBNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string SBTitle { get; set; } = string.Empty;

        [MaxLength(50)]
        public string SBRevision { get; set; } = string.Empty;

        public DateTime? SBDate { get; set; }

        [MaxLength(200)]
        public string IssuedBy { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AffectedPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AffectedSerialNumbers { get; set; } = string.Empty;

        public BulletinCategory Category { get; set; } = BulletinCategory.Recommended;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string ComplianceMethod { get; set; } = string.Empty;

        public DateTime? ComplianceDate { get; set; }

        [MaxLength(2000)]
        public string Remarks { get; set; } = string.Empty;

        [MaxLength(200)]
        public string EvaluatedBy { get; set; } = string.Empty;

        public DateTime? EvaluatedDate { get; set; }

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