using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class Component
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string PartNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ModelSeries { get; set; } = string.Empty;

        public Guid ATAChapterId { get; set; }
        public Guid ShopId { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATAChapter ATAChapter { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
        public ICollection<CapabilityAssessment> CapabilityAssessments { get; set; } = new List<CapabilityAssessment>();
        public ICollection<AirworthinessDirective> AirworthinessDirectives { get; set; } = new List<AirworthinessDirective>();
        public ICollection<ServiceBulletin> ServiceBulletins { get; set; } = new List<ServiceBulletin>();
        public ICollection<ToolNeedsAnalysis> ToolNeedsAnalyses { get; set; } = new List<ToolNeedsAnalysis>();
    }
}