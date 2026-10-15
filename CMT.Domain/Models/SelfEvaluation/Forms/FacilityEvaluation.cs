using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Facility Evaluation form - covers Repair Facility, Cleaning Facility, 
    /// and Environmental Requirement evaluations.
    /// Corresponds to Excel sheets: "REPAIR FACILITY REQUIREMENT EVALUATION",
    /// "CLEANING FACILITY EVALUATION", "ENVIRONMENTAL REQUIREMENT AND FACILITY EVALUATION".
    /// </summary>
    public class FacilityEvaluation
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        /// <summary>
        /// Type of facility evaluation: "repair", "cleaning", "environmental"
        /// </summary>
        [Required]
        [MaxLength(50)]
        public string FacilityType { get; set; } = string.Empty;

        [MaxLength(200)]
        public string FacilityName { get; set; } = string.Empty;

        [MaxLength(500)]
        public string FacilityLocation { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        // Evaluation criteria
        [MaxLength(2000)]
        public string RequirementsDescription { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string CurrentCapabilities { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string GapAnalysis { get; set; } = string.Empty;

        // Environmental-specific fields
        [MaxLength(1000)]
        public string TemperatureRequirements { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string HumidityRequirements { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string VentilationRequirements { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string LightingRequirements { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string CleanlinessRequirements { get; set; } = string.Empty;

        // Cleaning-specific fields
        [MaxLength(1000)]
        public string CleaningMethodRequired { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string CleaningEquipmentRequired { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string ChemicalsRequired { get; set; } = string.Empty;

        // Repair-specific fields
        [MaxLength(1000)]
        public string RepairEquipmentRequired { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string RepairProcessCapability { get; set; } = string.Empty;

        // Evaluation checklist items stored as JSON
        public string EvaluationItemsJson { get; set; } = "[]";

        public ComplianceStatus OverallComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string CorrectiveActions { get; set; } = string.Empty;

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