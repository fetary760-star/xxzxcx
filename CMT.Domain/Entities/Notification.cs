using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Entities
{
    public class Notification
    {
        [Key]
        public int NotificationId { get; set; }

        [Required]
        public int RecipientId { get; set; }

        [ForeignKey("RecipientId")]
        public virtual User Recipient { get; set; } = null!;

        [Required]
        [StringLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [StringLength(1000)]
        public string Message { get; set; } = string.Empty;

        [StringLength(50)]
        public string Type { get; set; } = "Info"; // Info, Warning, Error, Success

        public bool IsRead { get; set; } = false;

        public DateTime? ReadAt { get; set; }

        public int? RelatedTaskId { get; set; }

        [StringLength(100)]
        public string? ActionUrl { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }
    }
}