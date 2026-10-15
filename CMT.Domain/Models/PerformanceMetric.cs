using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("performance_metrics")]
public class PerformanceMetric : BaseEntity
{
    [Key]
    [Column("metric_id")]
    public int MetricId { get; set; }

    [Required]
    [Column("user_id")]
    public int UserId { get; set; }

    [Column("tasks_completed")]
    public int TasksCompleted { get; set; } = 0;

    [Column("tasks_on_time")]
    public int TasksOnTime { get; set; } = 0;

    [Column("tasks_overdue")]
    public int TasksOverdue { get; set; } = 0;

    [Column("average_completion_time")]
    public decimal? AverageCompletionTime { get; set; }

    [Column("efficiency_rating")]
    public decimal? EfficiencyRating { get; set; }

    [Column("last_calculated_at")]
    public DateTime? LastCalculatedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // Navigation properties
    [ForeignKey("UserId")]
    public virtual User User { get; set; } = null!;
}