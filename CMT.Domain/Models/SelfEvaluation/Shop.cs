using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class Shop
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CertificateNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Address { get; set; } = string.Empty;

        [MaxLength(100)]
        public string City { get; set; } = string.Empty;

        [MaxLength(100)]
        public string State { get; set; } = string.Empty;

        [MaxLength(20)]
        public string ZipCode { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Country { get; set; } = string.Empty;

        [MaxLength(50)]
        public string Phone { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Email { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AccountableManager { get; set; } = string.Empty;

        [MaxLength(200)]
        public string QualityManager { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string CreatedBy { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // ===== NEW FIELDS =====

        /// <summary>
        /// The department this shop belongs to.
        /// </summary>
        public Guid? DepartmentId { get; set; }

        /// <summary>
        /// The Team Leader user who manages this shop.
        /// ⚠️ D5: retyped from Guid? to long? in Phase 0. User.Id is long, so the
        /// previous type made routing resolution unimplementable — reading this column
        /// to find the responsible STL yielded a value that could never match a user.
        /// </summary>
        public long? TeamLeaderUserId { get; set; }

        /// <summary>
        /// The Shop Manager user (optional, when multiple TLs exist).
        /// ⚠️ D5: retyped from Guid? to long? for the same reason.
        /// </summary>
        public long? ShopManagerUserId { get; set; }

        // Navigation properties
        public Department? Department { get; set; }
        public ICollection<Component> Components { get; set; } = new List<Component>();
        public ICollection<ATARecord> ATARecords { get; set; } = new List<ATARecord>();
        public ICollection<CapabilityAssessment> CapabilityAssessments { get; set; } = new List<CapabilityAssessment>();
        public ICollection<ToolNeedsAnalysis> ToolNeedsAnalyses { get; set; } = new List<ToolNeedsAnalysis>();
        public ICollection<SelfAuditChecklist> SelfAuditChecklists { get; set; } = new List<SelfAuditChecklist>();
        public ICollection<EmployeeProficiencyRecord> EmployeeProficiencyRecords { get; set; } = new List<EmployeeProficiencyRecord>();
        public ICollection<ResponsibilityDelegation> ResponsibilityDelegations { get; set; } = new List<ResponsibilityDelegation>();
    }
}