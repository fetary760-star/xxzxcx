using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Similar Technology Evaluation form.
    /// Corresponds to Excel sheet "SEPARETOR01" - 
    /// "SIMILAR TECHNOLOGY (IF TRAINING IS NOT AVAILABLE) OR SIMPLE TASK COMPONENT EVALUATION".
    /// </summary>
    public class SimilarTechnologyEvaluation
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(500)]
        public string EvaluationTitle { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        // Similar technology reference
        [MaxLength(200)]
        public string ReferenceComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ReferenceComponentDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ReferenceManufacturer { get; set; } = string.Empty;

        // Evaluation criteria
        [MaxLength(2000)]
        public string SimilarityJustification { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string TechnologyComparison { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string MaterialsComparison { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string ProcessComparison { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string ToolingComparison { get; set; } = string.Empty;

        public bool IsSimpleTask { get; set; }

        [MaxLength(2000)]
        public string SimpleTaskJustification { get; set; } = string.Empty;

        // Evaluation result
        public bool IsSimilarTechnologyApplicable { get; set; }

        [MaxLength(2000)]
        public string Limitations { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string AdditionalRequirements { get; set; } = string.Empty;

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