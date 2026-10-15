using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class CapabilityAssessment
    {
        public Guid Id { get; set; }

        public Guid ComponentId { get; set; }
        public Guid ShopId { get; set; }

        public CapabilityStatus Status { get; set; } = CapabilityStatus.NotAssessed;

        [MaxLength(2000)]
        public string Justification { get; set; } = string.Empty;

        public bool HasRequiredTooling { get; set; }
        public bool HasRequiredTraining { get; set; }
        public bool HasTechnicalData { get; set; }
        public bool HasRequiredFacilities { get; set; }

        [MaxLength(2000)]
        public string Limitations { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string CorrectiveActions { get; set; } = string.Empty;

        public DateTime? AssessmentDate { get; set; }
        public DateTime? NextReviewDate { get; set; }

        [MaxLength(200)]
        public string AssessedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Component Component { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}