using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Request Letter form for capability evaluation requests.
    /// Corresponds to Excel sheet "REQUEST LETTER".
    /// </summary>
    public class RequestLetter
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(100)]
        public string LetterReferenceNo { get; set; } = string.Empty;

        public DateTime? LetterDate { get; set; }

        [MaxLength(200)]
        public string AddressedTo { get; set; } = string.Empty;

        [MaxLength(200)]
        public string AddressedToTitle { get; set; } = string.Empty;

        [MaxLength(500)]
        public string AddressedToOrganization { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Subject { get; set; } = string.Empty;

        [MaxLength(4000)]
        public string Body { get; set; } = string.Empty;

        [MaxLength(200)]
        public string RequestedCapability { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        [MaxLength(200)]
        public string SenderName { get; set; } = string.Empty;

        [MaxLength(200)]
        public string SenderTitle { get; set; } = string.Empty;

        [MaxLength(200)]
        public string SenderSignature { get; set; } = string.Empty;

        public DateTime? SentDate { get; set; }

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime? ApprovedDate { get; set; }

        // Approval workflow
        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord ATARecord { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}