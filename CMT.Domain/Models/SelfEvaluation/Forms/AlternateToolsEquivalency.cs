using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Alternate Tools Equivalency Certificates form.
    /// Tracks alternate tool certifications and equivalency declarations.
    /// </summary>
    public class AlternateToolsEquivalency
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        // Original tool details
        [MaxLength(200)]
        public string OriginalToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string OriginalToolDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string OriginalToolManufacturer { get; set; } = string.Empty;

        // Alternate tool details
        [MaxLength(200)]
        public string AlternateToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AlternateToolDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AlternateToolManufacturer { get; set; } = string.Empty;

        // Equivalency justification
        [MaxLength(2000)]
        public string EquivalencyJustification { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string TechnicalBasis { get; set; } = string.Empty;

        [MaxLength(500)]
        public string CertificateReference { get; set; } = string.Empty;

        public DateTime? CertificateDate { get; set; }

        public bool IsEquivalencyApproved { get; set; }

        [MaxLength(2000)]
        public string Conditions { get; set; } = string.Empty;

        // Multiple entries stored as JSON
        public string AlternateToolsListJson { get; set; } = "[]";

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