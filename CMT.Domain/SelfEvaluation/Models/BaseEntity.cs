using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation;

/// <summary>
/// Base class for all domain entities providing common audit properties.
/// </summary>
public abstract class BaseEntity
{
    public long Id { get; set; }
    public CMT.Domain.Models.Shared.RecordStatus RecordStatus { get; set; } = CMT.Domain.Models.Shared.RecordStatus.Active;
    public string RegisteredBy { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public DateTime LastUpdateDate { get; set; } = DateTime.UtcNow;
    public string? LastUpdatedBy { get; set; }

    /// <summary>
    /// Updates audit fields when a record is modified.
    /// </summary>
    public void UpdateAudit(string updatedBy)
    {
        LastUpdatedBy = updatedBy;
        LastUpdateDate = DateTime.UtcNow;
    }
}
