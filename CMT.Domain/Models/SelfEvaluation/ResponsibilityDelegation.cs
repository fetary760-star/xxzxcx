using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class ResponsibilityDelegation
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string DelegatedBy { get; set; } = string.Empty;

        [Required]
        [MaxLength(200)]
        public string DelegatedTo { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Responsibility { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Scope { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Conditions { get; set; } = string.Empty;

        public DelegationStatus Status { get; set; } = DelegationStatus.Active;

        public DateTime EffectiveDate { get; set; } = DateTime.UtcNow;
        public DateTime? ExpirationDate { get; set; }

        [MaxLength(2000)]
        public string Notes { get; set; } = string.Empty;

        public Guid ShopId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Shop Shop { get; set; } = null!;
    }
}