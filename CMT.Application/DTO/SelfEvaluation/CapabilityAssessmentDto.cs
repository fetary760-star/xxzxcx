using System;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.DTO.SelfEvaluation
{
    public class CapabilityAssessmentDto
    {
        public Guid Id { get; set; }
        public Guid ComponentId { get; set; }
        public string ComponentPartNumber { get; set; } = string.Empty;
        public string ComponentDescription { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public CapabilityStatus Status { get; set; }
        public string Justification { get; set; } = string.Empty;
        public bool HasRequiredTooling { get; set; }
        public bool HasRequiredTraining { get; set; }
        public bool HasTechnicalData { get; set; }
        public bool HasRequiredFacilities { get; set; }
        public string Limitations { get; set; } = string.Empty;
        public string CorrectiveActions { get; set; } = string.Empty;
        public DateTime? AssessmentDate { get; set; }
        public DateTime? NextReviewDate { get; set; }
        public string AssessedBy { get; set; } = string.Empty;
        public string ApprovedBy { get; set; } = string.Empty;
    }
}