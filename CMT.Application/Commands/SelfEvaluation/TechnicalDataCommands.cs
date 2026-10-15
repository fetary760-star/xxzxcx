using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    // Airworthiness Directive Commands
    public class CreateAirworthinessDirectiveCommand : IRequest<Guid>
    {
        public string ADNumber { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime? EffectiveDate { get; set; }
        public DirectiveApplicability Applicability { get; set; }
        public ComplianceStatus ComplianceStatus { get; set; }
        public string ComplianceMethod { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public Guid ComponentId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateAirworthinessDirectiveCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ADNumber { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime? EffectiveDate { get; set; }
        public DirectiveApplicability Applicability { get; set; }
        public ComplianceStatus ComplianceStatus { get; set; }
        public string ComplianceMethod { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // Service Bulletin Commands
    public class CreateServiceBulletinCommand : IRequest<Guid>
    {
        public string SBNumber { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime? IssueDate { get; set; }
        public DateTime? RevisionDate { get; set; }
        public string Revision { get; set; } = string.Empty;
        public BulletinCategory Category { get; set; }
        public ComplianceStatus ComplianceStatus { get; set; }
        public string ComplianceNotes { get; set; } = string.Empty;
        public Guid ComponentId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateServiceBulletinCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string SBNumber { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public DateTime? IssueDate { get; set; }
        public DateTime? RevisionDate { get; set; }
        public string Revision { get; set; } = string.Empty;
        public BulletinCategory Category { get; set; }
        public ComplianceStatus ComplianceStatus { get; set; }
        public string ComplianceNotes { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // Tool Needs Analysis Commands
    public class CreateToolNeedsAnalysisCommand : IRequest<Guid>
    {
        public string ToolName { get; set; } = string.Empty;
        public string ToolPartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Manufacturer { get; set; } = string.Empty;
        public ToolStatus Status { get; set; }
        public DateTime? CalibrationDueDate { get; set; }
        public string CalibrationInterval { get; set; } = string.Empty;
        public string StorageLocation { get; set; } = string.Empty;
        public int QuantityRequired { get; set; }
        public int QuantityAvailable { get; set; }
        public string Notes { get; set; } = string.Empty;
        public Guid ComponentId { get; set; }
        public Guid ShopId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateToolNeedsAnalysisCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ToolName { get; set; } = string.Empty;
        public string ToolPartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Manufacturer { get; set; } = string.Empty;
        public ToolStatus Status { get; set; }
        public DateTime? CalibrationDueDate { get; set; }
        public string CalibrationInterval { get; set; } = string.Empty;
        public string StorageLocation { get; set; } = string.Empty;
        public int QuantityRequired { get; set; }
        public int QuantityAvailable { get; set; }
        public string Notes { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }
}