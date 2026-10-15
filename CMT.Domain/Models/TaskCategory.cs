using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_categories")]
public class TaskCategory : BaseEntity
{
    [Key]
    [Column("category_id")]
    public int CategoryId { get; set; }

    [Required]
    [StringLength(100)]
    [Column("name")]
    public string Name { get; set; } = string.Empty;

    [Column("description", TypeName = "TEXT")]
    public string? Description { get; set; }

    // Navigation properties
    public virtual ICollection<Task> Tasks { get; set; } = new List<Task>();
    public virtual ICollection<TaskSubType> SubTypes { get; set; } = new List<TaskSubType>();
    public virtual TaskCategoryTargetDay? TargetDay { get; set; }
}