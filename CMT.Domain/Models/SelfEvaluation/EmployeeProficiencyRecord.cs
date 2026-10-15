using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class EmployeeProficiencyRecord
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string EmployeeName { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string EmployeeId { get; set; } = string.Empty;

        [MaxLength(200)]
        public string JobTitle { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Department { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Certifications { get; set; } = string.Empty;

        public ProficiencyLevel ProficiencyLevel { get; set; } = ProficiencyLevel.NotRated;

        [MaxLength(500)]
        public string SkillAreas { get; set; } = string.Empty;

        public DateTime? LastTrainingDate { get; set; }
        public DateTime? NextTrainingDue { get; set; }

        [MaxLength(2000)]
        public string TrainingHistory { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Notes { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public Guid ShopId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Shop Shop { get; set; } = null!;
    }
}