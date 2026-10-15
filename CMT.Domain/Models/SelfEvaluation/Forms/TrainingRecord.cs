using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Training Record form - covers Component Maintenance and Generic Course,
    /// Inspector Proficiency, and Competency Assessment Declaration.
    /// </summary>
    public class TrainingRecord
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        /// <summary>
        /// Type of training record: 
        /// "component_maintenance_training", "inspector_proficiency", "competency_assessment"
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string TrainingType { get; set; } = string.Empty;

        [MaxLength(200)]
        public string TrainingTitle { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        // Employee details
        [MaxLength(200)]
        public string EmployeeName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string EmployeeId { get; set; } = string.Empty;

        [MaxLength(200)]
        public string EmployeeTitle { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Department { get; set; } = string.Empty;

        // Training details
        [MaxLength(500)]
        public string CourseName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string CourseProvider { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CertificateNumber { get; set; } = string.Empty;

        public DateTime? TrainingStartDate { get; set; }

        public DateTime? TrainingEndDate { get; set; }

        public DateTime? ExpiryDate { get; set; }

        public int TrainingHours { get; set; }

        public ProficiencyLevel ProficiencyLevel { get; set; } = ProficiencyLevel.NotRated;

        // Assessment details (for competency assessment)
        [MaxLength(2000)]
        public string AssessmentCriteria { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string AssessmentResults { get; set; } = string.Empty;

        public bool IsCompetent { get; set; }

        [MaxLength(2000)]
        public string CompetencyDeclaration { get; set; } = string.Empty;

        // Inspector proficiency specific
        [MaxLength(500)]
        public string InspectionAuthority { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string InspectionScope { get; set; } = string.Empty;

        // Multiple training entries stored as JSON
        public string TrainingHistoryJson { get; set; } = "[]";

        [MaxLength(200)]
        public string AssessedBy { get; set; } = string.Empty;

        public DateTime? AssessedDate { get; set; }

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime? ApprovedDate { get; set; }

        // Approval workflow
        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord ATARecord { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}