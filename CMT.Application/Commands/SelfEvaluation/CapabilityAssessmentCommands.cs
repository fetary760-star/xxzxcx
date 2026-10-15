using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    public class CreateCapabilityAssessmentCommand : IRequest<Guid>
    {
        public Guid ComponentId { get; set; }
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
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateCapabilityAssessmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public CapabilityStatus Status { get; set; }
        public string Justification { get; set; } = string.Empty;
        public bool HasRequiredTooling { get; set; }
        public bool HasRequiredTraining { get; set; }
        public bool HasTechnicalData { get; set; }
        public bool HasRequiredFacilities { get; set; }
        public string Limitations { get; set; } = string.Empty;
        public string CorrectiveActions { get; set; } = string.Empty;
        public DateTime? NextReviewDate { get; set; }
        public string ApprovedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }

    public class DeleteCapabilityAssessmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }
}