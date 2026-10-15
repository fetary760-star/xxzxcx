using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

public abstract class BaseEntity
{
    [Required]
    [Column("start_date")]
    public DateTime StartDate { get; set; }

    [Required]
    [Column("end_date")]
    public DateTime EndDate { get; set; }

    [Required]
    [StringLength(100)]
    [Column("timezone_info")]
    public string TimeZoneInfo { get; set; } = "UTC";

    [Required]
    [Column("registered_date")]
    public DateTime RegisteredDate { get; set; }

    [Required]
    [StringLength(100)]
    [Column("registered_by")]
    public string RegisteredBy { get; set; } = string.Empty;

    [Required]
    [Column("last_update_date")]
    public DateTime LastUpdateDate { get; set; }

    [Required]
    [StringLength(100)]
    [Column("updated_by")]
    public string UpdatedBy { get; set; } = string.Empty;

    [Column("record_status")]
    public RecordStatus RecordStatus { get; set; } = RecordStatus.Active;

    [Column("is_readonly")]
    public bool IsReadOnly { get; set; } = false;

    public virtual void UpdateAudit(string updatedBy)
    {
        LastUpdateDate = DateTime.UtcNow;
        UpdatedBy = updatedBy;
    }
}

public enum RecordStatus
{
    Inactive = 1,
    Active = 2,
    Deleted = 3
}