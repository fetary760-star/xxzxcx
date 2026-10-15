using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// Department entity (e.g., CMT, ACS, MCS, NDT, Standard).
    /// Departments are overseen by Directors and house Managers for sub-areas.
    /// </summary>
    public class Department
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(50)]
        public string Code { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string Description { get; set; } = string.Empty;

        // The Director who oversees this department (references User.Id which is long)
        public long? DirectorUserId { get; set; }

        // Parent department for sub-departments
        public Guid? ParentDepartmentId { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public Department? ParentDepartment { get; set; }
        public ICollection<Department> SubDepartments { get; set; } = new List<Department>();
        public ICollection<Shop> Shops { get; set; } = new List<Shop>();
    }
}
