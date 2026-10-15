using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// In-House Manufactured Tools Job Instruction Card.
    /// Tracks tools manufactured in-house with job instructions.
    /// </summary>
    public class InhouseManufacturedToolsCard
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
        public string JobCardNumber { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ToolName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ToolDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ToolDrawingReference { get; set; } = string.Empty;

        // Manufacturing details
        [MaxLength(200)]
        public string MaterialSpecification { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string ManufacturingProcess { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string QualityRequirements { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string InspectionCriteria { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string AcceptanceCriteria { get; set; } = string.Empty;

        // Calibration
        public bool RequiresCalibration { get; set; }

        [MaxLength(100)]
        public string CalibrationInterval { get; set; } = string.Empty;

        [MaxLength(500)]
        public string CalibrationMethod { get; set; } = string.Empty;

        // Job instruction steps stored as JSON
        public string InstructionStepsJson { get; set; } = "[]";

        [MaxLength(200)]
        public string ManufacturedBy { get; set; } = string.Empty;

        public DateTime? ManufacturedDate { get; set; }

        [MaxLength(200)]
        public string InspectedBy { get; set; } = string.Empty;

        public DateTime? InspectedDate { get; set; }

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