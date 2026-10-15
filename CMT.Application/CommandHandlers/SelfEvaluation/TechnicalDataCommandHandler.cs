using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class TechnicalDataCommandHandler :
        IRequestHandler<CreateAirworthinessDirectiveCommand, Guid>,
        IRequestHandler<UpdateAirworthinessDirectiveCommand, bool>,
        IRequestHandler<CreateServiceBulletinCommand, Guid>,
        IRequestHandler<UpdateServiceBulletinCommand, bool>,
        IRequestHandler<CreateToolNeedsAnalysisCommand, Guid>,
        IRequestHandler<UpdateToolNeedsAnalysisCommand, bool>
    {
        private readonly ApplicationDbContext _context;

        public TechnicalDataCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        // Airworthiness Directive Handlers
        public async Task<Guid> Handle(CreateAirworthinessDirectiveCommand request, CancellationToken cancellationToken)
        {
            var directive = new AirworthinessDirective
            {
                Id = Guid.NewGuid(),
                ADNumber = request.ADNumber,
                Title = request.Title,
                Description = request.Description,
                EffectiveDate = request.EffectiveDate,
                Applicability = request.Applicability,
                ComplianceStatus = request.ComplianceStatus,
                ComplianceMethod = request.ComplianceMethod,
                Notes = request.Notes,
                ComponentId = request.ComponentId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.AirworthinessDirectives.Add(directive);
            await _context.SaveChangesAsync(cancellationToken);

            return directive.Id;
        }

        public async Task<bool> Handle(UpdateAirworthinessDirectiveCommand request, CancellationToken cancellationToken)
        {
            var directive = await _context.AirworthinessDirectives.FindAsync(new object[] { request.Id }, cancellationToken);
            if (directive == null) return false;

            directive.ADNumber = request.ADNumber;
            directive.Title = request.Title;
            directive.Description = request.Description;
            directive.EffectiveDate = request.EffectiveDate;
            directive.Applicability = request.Applicability;
            directive.ComplianceStatus = request.ComplianceStatus;
            directive.ComplianceMethod = request.ComplianceMethod;
            directive.Notes = request.Notes;
            directive.UpdatedAt = DateTime.UtcNow;
            directive.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // Service Bulletin Handlers
        public async Task<Guid> Handle(CreateServiceBulletinCommand request, CancellationToken cancellationToken)
        {
            var bulletin = new ServiceBulletin
            {
                Id = Guid.NewGuid(),
                SBNumber = request.SBNumber,
                Title = request.Title,
                Description = request.Description,
                IssueDate = request.IssueDate,
                RevisionDate = request.RevisionDate,
                Revision = request.Revision,
                Category = request.Category,
                ComplianceStatus = request.ComplianceStatus,
                ComplianceNotes = request.ComplianceNotes,
                ComponentId = request.ComponentId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.ServiceBulletins.Add(bulletin);
            await _context.SaveChangesAsync(cancellationToken);

            return bulletin.Id;
        }

        public async Task<bool> Handle(UpdateServiceBulletinCommand request, CancellationToken cancellationToken)
        {
            var bulletin = await _context.ServiceBulletins.FindAsync(new object[] { request.Id }, cancellationToken);
            if (bulletin == null) return false;

            bulletin.SBNumber = request.SBNumber;
            bulletin.Title = request.Title;
            bulletin.Description = request.Description;
            bulletin.IssueDate = request.IssueDate;
            bulletin.RevisionDate = request.RevisionDate;
            bulletin.Revision = request.Revision;
            bulletin.Category = request.Category;
            bulletin.ComplianceStatus = request.ComplianceStatus;
            bulletin.ComplianceNotes = request.ComplianceNotes;
            bulletin.UpdatedAt = DateTime.UtcNow;
            bulletin.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // Tool Needs Analysis Handlers
        public async Task<Guid> Handle(CreateToolNeedsAnalysisCommand request, CancellationToken cancellationToken)
        {
            var tool = new ToolNeedsAnalysis
            {
                Id = Guid.NewGuid(),
                ToolName = request.ToolName,
                ToolPartNumber = request.ToolPartNumber,
                Description = request.Description,
                Manufacturer = request.Manufacturer,
                Status = request.Status,
                CalibrationDueDate = request.CalibrationDueDate,
                CalibrationInterval = request.CalibrationInterval,
                StorageLocation = request.StorageLocation,
                QuantityRequired = request.QuantityRequired,
                QuantityAvailable = request.QuantityAvailable,
                Notes = request.Notes,
                ComponentId = request.ComponentId,
                ShopId = request.ShopId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.ToolNeedsAnalyses.Add(tool);
            await _context.SaveChangesAsync(cancellationToken);

            return tool.Id;
        }

        public async Task<bool> Handle(UpdateToolNeedsAnalysisCommand request, CancellationToken cancellationToken)
        {
            var tool = await _context.ToolNeedsAnalyses.FindAsync(new object[] { request.Id }, cancellationToken);
            if (tool == null) return false;

            tool.ToolName = request.ToolName;
            tool.ToolPartNumber = request.ToolPartNumber;
            tool.Description = request.Description;
            tool.Manufacturer = request.Manufacturer;
            tool.Status = request.Status;
            tool.CalibrationDueDate = request.CalibrationDueDate;
            tool.CalibrationInterval = request.CalibrationInterval;
            tool.StorageLocation = request.StorageLocation;
            tool.QuantityRequired = request.QuantityRequired;
            tool.QuantityAvailable = request.QuantityAvailable;
            tool.Notes = request.Notes;
            tool.UpdatedAt = DateTime.UtcNow;
            tool.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}