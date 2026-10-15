using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// File attachment for either an ATA Record or a specific Form Submission.
    /// Users can upload files instead of editing forms directly.
    /// </summary>
    public class FormFileAttachment
    {
        public Guid Id { get; set; }

        // Either ATARecordId or FormSubmissionId should be set (or both for form-specific files)
        public Guid? ATARecordId { get; set; }
        public Guid? FormSubmissionId { get; set; }

        [Required]
        [MaxLength(500)]
        public string FileName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ContentType { get; set; } = string.Empty;

        public long FileSizeBytes { get; set; }

        [Required]
        [MaxLength(1000)]
        public string StoragePath { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty; // Which form this file relates to

        // Approval tracking for uploaded files
        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;
        public Guid? ApprovedByUserId { get; set; }
        public DateTime? ApprovedDate { get; set; }

        [MaxLength(500)]
        public string ApprovalComments { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string UploadedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord? ATARecord { get; set; }
        public FormSubmission? FormSubmission { get; set; }
    }
}