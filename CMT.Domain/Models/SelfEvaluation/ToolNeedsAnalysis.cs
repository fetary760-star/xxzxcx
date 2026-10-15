using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class ToolNeedsAnalysis
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string ToolName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ToolPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        public ToolStatus Status { get; set; } = ToolStatus.NotRequired;

        public DateTime? CalibrationDueDate { get; set; }

        [MaxLength(100)]
        public string CalibrationInterval { get; set; } = string.Empty;

        [MaxLength(500)]
        public string StorageLocation { get; set; } = string.Empty;

        public int QuantityRequired { get; set; }
        public int QuantityAvailable { get; set; }

        [MaxLength(2000)]
        public string Notes { get; set; } = string.Empty;

        public Guid ComponentId { get; set; }
        public Guid ShopId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Component Component { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}