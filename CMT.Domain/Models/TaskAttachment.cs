using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("task_attachments")]
public class TaskAttachment : BaseEntity
{
    [Key]
    [Column("attachment_id")]
    public int AttachmentId { get; set; }

    [Required]
    [Column("task_id")]
    public int TaskId { get; set; }

    [Required]
    [StringLength(255)]
    [Column("file_name")]
    public string FileName { get; set; } = string.Empty;

    [Required]
    [StringLength(500)]
    [Column("file_path")]
    public string FilePath { get; set; } = string.Empty;

    [StringLength(100)]
    [Column("file_type")]
    public string? FileType { get; set; }

    [Column("file_size")]
    public long? FileSize { get; set; }

    [Required]
    [Column("uploaded_by")]
    public int UploadedBy { get; set; }

    [Column("uploaded_at")]
    public DateTime UploadedAt { get; set; }

    // Navigation properties
    [ForeignKey("TaskId")]
    public virtual Task Task { get; set; } = null!;

    [ForeignKey("UploadedBy")]
    public virtual User UploadedByUser { get; set; } = null!;
}