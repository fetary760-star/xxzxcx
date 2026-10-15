using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class AirworthinessDirective
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string ADNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Description { get; set; } = string.Empty;

        public DateTime? EffectiveDate { get; set; }

        public DirectiveApplicability Applicability { get; set; } = DirectiveApplicability.NotDetermined;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string ComplianceMethod { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Notes { get; set; } = string.Empty;

        public Guid ComponentId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Component Component { get; set; } = null!;
    }
}