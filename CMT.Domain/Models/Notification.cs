using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

// Updated to use UserId to match database schema
public class Notification : BaseEntity
{
    [Key]
    public int NotificationId { get; set; }

    [Required]
    public int UserId { get; set; }

    [Required]
    public string Message { get; set; } = string.Empty;

    [MaxLength(50)]
    public string NotificationType { get; set; } = "General";

    [MaxLength(20)]
    public string Priority { get; set; } = "Medium";

    public int? TaskId { get; set; }

    [MaxLength(100)]
    public string? RelatedEntity { get; set; }

    [MaxLength(500)]
    public string? ActionUrl { get; set; }

    // Store metadata as JSON in DB
    public string? Metadata { get; set; }

    public bool IsRead { get; set; } = false;

    public DateTime? ReadAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ExpiresAt { get; set; }

    // Navigation properties
    [ForeignKey("UserId")]
    public virtual User Recipient { get; set; } = null!;

    [ForeignKey("TaskId")]
    public virtual Task? Task { get; set; }
}