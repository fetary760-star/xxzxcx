using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class SelfAuditChecklist
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Section { get; set; } = string.Empty;

        [MaxLength(50)]
        public string ItemNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(1000)]
        public string Question { get; set; } = string.Empty;

        [MaxLength(500)]
        public string RegulatoryReference { get; set; } = string.Empty;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string Findings { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string CorrectiveAction { get; set; } = string.Empty;

        public DateTime? DueDate { get; set; }
        public DateTime? CompletionDate { get; set; }

        [MaxLength(200)]
        public string AssignedTo { get; set; } = string.Empty;

        public AuditStatus AuditStatus { get; set; } = AuditStatus.NotStarted;

        public Guid ShopId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Shop Shop { get; set; } = null!;
    }
}