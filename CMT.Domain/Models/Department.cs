using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("departments")]
public class Department : BaseEntity
{
    [Key]
    [Column("department_id")]
    public int DepartmentId { get; set; }

    [Required]
    [StringLength(100)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description", TypeName = "TEXT")]
    public string? Description { get; set; }

    // Director who created/owns this department
    [Column("director_id")]
    public int DirectorId { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("DirectorId")]
    public virtual User Director { get; set; } = null!;

    // REMOVED [InverseProperty] attributes to avoid ambiguity
    // Relationships will be configured in DbContext using Fluent API
    // Multiple managers can be assigned to this department (filtered by Role = Manager)
    public virtual ICollection<User> Managers { get; set; } = new List<User>();

    // All users belonging to this department (includes managers, shop TLs, engineers, etc.)
    public virtual ICollection<User> Users { get; set; } = new List<User>();
}