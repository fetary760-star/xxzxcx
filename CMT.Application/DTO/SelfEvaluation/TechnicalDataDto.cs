using System;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.DTO.SelfEvaluation
{
    public static class TechnicalDataDto
    {
        public class AirworthinessDirectiveDto
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
            public Guid ComponentId { get; set; }
        }

        public class ServiceBulletinDto
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
            public Guid ComponentId { get; set; }
        }

        public class ToolNeedsAnalysisDto
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
            public Guid ComponentId { get; set; }
            public string ComponentPartNumber { get; set; } = string.Empty;
            public Guid ShopId { get; set; }
        }
    }
}