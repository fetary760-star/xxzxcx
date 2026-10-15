using System;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.DTO.SelfEvaluation
{
    public class SelfAuditChecklistDto
    {
        public Guid Id { get; set; }
        public string Section { get; set; } = string.Empty;
        public string ItemNumber { get; set; } = string.Empty;
        public string Question { get; set; } = string.Empty;
        public string RegulatoryReference { get; set; } = string.Empty;
        public ComplianceStatus ComplianceStatus { get; set; }
        public string Findings { get; set; } = string.Empty;
        public string CorrectiveAction { get; set; } = string.Empty;
        public DateTime? DueDate { get; set; }
        public DateTime? CompletionDate { get; set; }
        public string AssignedTo { get; set; } = string.Empty;
        public AuditStatus AuditStatus { get; set; }
        public Guid ShopId { get; set; }
    }
}