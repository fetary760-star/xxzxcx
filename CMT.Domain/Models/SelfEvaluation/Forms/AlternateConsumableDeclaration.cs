using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Alternate Consumable Declaration form.
    /// Corresponds to Excel sheet "ALTERNATE CONSUMABLE DECLARATION (IF ALTERNATE CONSUMABLE ARE USED)".
    /// </summary>
    public class AlternateConsumableDeclaration
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

        // Original consumable details
        [MaxLength(200)]
        public string OriginalConsumableName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string OriginalSpecification { get; set; } = string.Empty;

        [MaxLength(200)]
        public string OriginalManufacturer { get; set; } = string.Empty;

        [MaxLength(200)]
        public string OriginalPartNumber { get; set; } = string.Empty;

        // Alternate consumable details
        [MaxLength(200)]
        public string AlternateConsumableName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AlternateSpecification { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AlternateManufacturer { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AlternatePartNumber { get; set; } = string.Empty;

        // Declaration details
        [MaxLength(2000)]
        public string EquivalencyBasis { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string TechnicalJustification { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ReferenceDocument { get; set; } = string.Empty;

        public bool IsApprovedByManufacturer { get; set; }

        [MaxLength(500)]
        public string ManufacturerApprovalReference { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Conditions { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Limitations { get; set; } = string.Empty;

        // Multiple alternate consumable entries stored as JSON
        public string AlternateConsumablesListJson { get; set; } = "[]";

        [MaxLength(200)]
        public string DeclaredBy { get; set; } = string.Empty;

        public DateTime? DeclaredDate { get; set; }

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