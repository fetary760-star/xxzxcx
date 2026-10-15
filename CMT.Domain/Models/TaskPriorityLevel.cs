using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_priority_levels")]
public class TaskPriorityLevel : BaseEntity
{
    [Key]
    [Column("priority_id")]
    public int PriorityId { get; set; }

    [Required]
    [StringLength(50)]
    [Column("level_name")]
    public string LevelName { get; set; } = string.Empty;

    [Column("description", TypeName = "TEXT")]
    public string? Description { get; set; }

    [Required]
    [Column("order_rank")]
    public int OrderRank { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    public virtual ICollection<Task> Tasks { get; set; } = new List<Task>();
}