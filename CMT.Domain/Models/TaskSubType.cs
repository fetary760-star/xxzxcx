using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_sub_types")]
public class TaskSubType : BaseEntity
{
    [Key]
    [Column("sub_type_id")]
    public int SubTypeId { get; set; }

    [Required]
    [Column("category_id")]
    public int CategoryId { get; set; }

    [Required]
    [StringLength(100)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description", TypeName = "TEXT")]
    public string? Description { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("CategoryId")]
    public virtual TaskCategory Category { get; set; } = null!;

    public virtual ICollection<Task> Tasks { get; set; } = new List<Task>();
}