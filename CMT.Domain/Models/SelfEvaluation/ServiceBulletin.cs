using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class ServiceBulletin
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string SBNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Description { get; set; } = string.Empty;

        public DateTime? IssueDate { get; set; }
        public DateTime? RevisionDate { get; set; }

        [MaxLength(20)]
        public string Revision { get; set; } = string.Empty;

        public BulletinCategory Category { get; set; } = BulletinCategory.Recommended;

        public ComplianceStatus ComplianceStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string ComplianceNotes { get; set; } = string.Empty;

        public Guid ComponentId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Component Component { get; set; } = null!;
    }
}