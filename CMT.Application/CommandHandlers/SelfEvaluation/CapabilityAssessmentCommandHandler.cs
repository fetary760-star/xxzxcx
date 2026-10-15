using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class CapabilityAssessmentCommandHandler :
        IRequestHandler<CreateCapabilityAssessmentCommand, Guid>,
        IRequestHandler<UpdateCapabilityAssessmentCommand, bool>,
        IRequestHandler<DeleteCapabilityAssessmentCommand, bool>
    {
        private readonly ApplicationDbContext _context;

        public CapabilityAssessmentCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Guid> Handle(CreateCapabilityAssessmentCommand request, CancellationToken cancellationToken)
        {
            var assessment = new CapabilityAssessment
            {
                Id = Guid.NewGuid(),
                ComponentId = request.ComponentId,
                ShopId = request.ShopId,
                Status = request.Status,
                Justification = request.Justification,
                HasRequiredTooling = request.HasRequiredTooling,
                HasRequiredTraining = request.HasRequiredTraining,
                HasTechnicalData = request.HasTechnicalData,
                HasRequiredFacilities = request.HasRequiredFacilities,
                Limitations = request.Limitations,
                CorrectiveActions = request.CorrectiveActions,
                AssessmentDate = request.AssessmentDate ?? DateTime.UtcNow,
                NextReviewDate = request.NextReviewDate,
                AssessedBy = request.AssessedBy,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.CapabilityAssessments.Add(assessment);
            await _context.SaveChangesAsync(cancellationToken);

            return assessment.Id;
        }

        public async Task<bool> Handle(UpdateCapabilityAssessmentCommand request, CancellationToken cancellationToken)
        {
            var assessment = await _context.CapabilityAssessments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (assessment == null) return false;

            assessment.Status = request.Status;
            assessment.Justification = request.Justification;
            assessment.HasRequiredTooling = request.HasRequiredTooling;
            assessment.HasRequiredTraining = request.HasRequiredTraining;
            assessment.HasTechnicalData = request.HasTechnicalData;
            assessment.HasRequiredFacilities = request.HasRequiredFacilities;
            assessment.Limitations = request.Limitations;
            assessment.CorrectiveActions = request.CorrectiveActions;
            assessment.NextReviewDate = request.NextReviewDate;
            assessment.ApprovedBy = request.ApprovedBy;
            assessment.UpdatedAt = DateTime.UtcNow;
            assessment.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DeleteCapabilityAssessmentCommand request, CancellationToken cancellationToken)
        {
            var assessment = await _context.CapabilityAssessments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (assessment == null) return false;

            _context.CapabilityAssessments.Remove(assessment);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}