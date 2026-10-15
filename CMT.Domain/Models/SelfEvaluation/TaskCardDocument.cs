using System;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// TaskCardDocument - a task card PDF fetched from the external MaintainX (Maintenix)
    /// application and persisted inside this application, organized by Part Number (P/N).
    ///
    /// This is the Task Card counterpart of the CMM Revision data held on
    /// <see cref="ATARecord.CMMPdfUrl"/>. Where CMM only keeps a link to the external
    /// system, task cards are downloaded and stored locally so they stay available even
    /// when the intranet source is offline or the task definition is later revised.
    ///
    /// Source flow reproduced by MaintainXExternalService:
    ///   login.jsp -> Shop Technician -> Task Definition Search (aTaskCd = ATA code)
    ///   -> DTC-JIC task definition -> Preview Task Cards -> PDF
    ///
    /// Grouping:
    ///   ATARecordId + PartNumber + ATAChapterCode identify the component the card belongs to.
    ///   TaskDefinitionCode identifies the specific card (e.g. "ELEM2535100DTC-JIC").
    ///   IsLatest marks the newest fetch for a given TaskDefinitionCode; older rows are kept
    ///   as revision history instead of being overwritten.
    ///
    /// The key type is Guid to stay consistent with ATARecord, FormSubmission and
    /// FormFileAttachment in this solution (these SelfEvaluation entities do not derive
    /// from BaseEntity).
    /// </summary>
    public class TaskCardDocument
    {
        public Guid Id { get; set; }

        // ===== OWNERSHIP / GROUPING =====

        /// <summary>
        /// Parent ATA record whose Documentation section owns this task card.
        /// </summary>
        public Guid ATARecordId { get; set; }

        /// <summary>
        /// Owning shop, denormalized for shop-scoped queries and dashboards.
        /// </summary>
        public Guid? ShopId { get; set; }

        /// <summary>
        /// Part Number (P/N) this task card belongs to. Task cards are listed grouped
        /// by this value, mirroring the CMM Revision tab.
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string PartNumber { get; set; } = string.Empty;

        /// <summary>
        /// ATA chapter code as held on the ATA record, e.g. "25-35-10".
        /// </summary>
        [MaxLength(20)]
        public string ATAChapterCode { get; set; } = string.Empty;

        /// <summary>
        /// Code actually submitted to MaintainX's "Task Definition Code:" search box
        /// (aTaskCd), e.g. "253510".
        /// </summary>
        [MaxLength(50)]
        public string TaskCode { get; set; } = string.Empty;

        // ===== EXTERNAL TASK DEFINITION =====

        /// <summary>
        /// Task definition code selected from the search results,
        /// e.g. "ELEM2535100DTC-JIC".
        /// </summary>
        [MaxLength(200)]
        public string TaskDefinitionCode { get; set; } = string.Empty;

        /// <summary>
        /// Human readable task definition name,
        /// e.g. "REPAIR TASK OF ESSENCE BEVERAGE MAKER".
        /// </summary>
        [MaxLength(500)]
        public string TaskDefinitionName { get; set; } = string.Empty;

        /// <summary>
        /// Absolute URL of the task definition page in MaintainX
        /// (the TaskDefinitionRedirector target).
        /// </summary>
        [MaxLength(1000)]
        public string TaskDefinitionUrl { get; set; } = string.Empty;

        /// <summary>
        /// Absolute URL that produced the PDF ("Preview Task Cards" target).
        /// Kept for traceability and for re-fetching a newer revision.
        /// </summary>
        [MaxLength(1000)]
        public string SourcePdfUrl { get; set; } = string.Empty;

        /// <summary>
        /// Originating external system. Always "MaintainX" for now.
        /// </summary>
        [MaxLength(50)]
        public string SourceSystem { get; set; } = "MaintainX";

        // ===== STORED FILE =====

        /// <summary>
        /// File name presented to the user on download.
        /// </summary>
        [Required]
        [MaxLength(500)]
        public string FileName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ContentType { get; set; } = "application/pdf";

        /// <summary>
        /// Physical location of the stored PDF (local folder or UNC share), following the
        /// same convention as FormFileAttachment.StoragePath. The database never holds
        /// the file bytes.
        /// </summary>
        [Required]
        [MaxLength(1000)]
        public string StoragePath { get; set; } = string.Empty;

        public long FileSizeBytes { get; set; }

        /// <summary>
        /// SHA-256 of the stored bytes. Used to detect that a re-fetch returned an
        /// identical document, so no duplicate revision row is created.
        /// </summary>
        [MaxLength(64)]
        public string FileSha256 { get; set; } = string.Empty;

        // ===== REVISION TRACKING =====

        /// <summary>
        /// Revision label reported by MaintainX, when available.
        /// </summary>
        [MaxLength(100)]
        public string RevisionNumber { get; set; } = string.Empty;

        /// <summary>
        /// Sequential fetch number for this TaskDefinitionCode, starting at 1.
        /// </summary>
        public int Version { get; set; } = 1;

        /// <summary>
        /// True for the newest fetch of this TaskDefinitionCode. Older rows are flagged
        /// false and retained as history.
        /// </summary>
        public bool IsLatest { get; set; } = true;

        public bool IsActive { get; set; } = true;

        [MaxLength(1000)]
        public string Remarks { get; set; } = string.Empty;

        // ===== AUDIT =====

        public DateTime FetchedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string FetchedBy { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // ===== NAVIGATION =====

        public ATARecord ATARecord { get; set; } = null!;
    }
}