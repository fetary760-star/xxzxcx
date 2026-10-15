using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_category_target_days")]
public class TaskCategoryTargetDay : BaseEntity
{
    [Key]
    [Column("target_id")]
    public int TargetId { get; set; }

    [Required]
    [Column("category_id")]
    public int CategoryId { get; set; }

    [Required]
    [Column("target_days")]
    public int TargetDays { get; set; } = 5;

    /// <summary>
    /// Target hours (0-23) for finer-grained assignment deadlines.
    /// Combined with TargetDays and TargetMinutes to form total target duration.
    /// </summary>
    [Column("target_hours")]
    public int TargetHours { get; set; } = 0;

    /// <summary>
    /// Target minutes (0-59) for the most granular assignment deadlines.
    /// Combined with TargetDays and TargetHours to form total target duration.
    /// </summary>
    [Column("target_minutes")]
    public int TargetMinutes { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("CategoryId")]
    public virtual TaskCategory Category { get; set; } = null!;

    /// <summary>
    /// Returns the total target duration as a TimeSpan for calculation purposes.
    /// </summary>
    [NotMapped]
    public TimeSpan TotalTargetDuration =>
        new TimeSpan(TargetDays, TargetHours, TargetMinutes, 0);
}
