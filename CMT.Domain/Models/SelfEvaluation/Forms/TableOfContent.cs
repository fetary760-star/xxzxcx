using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// Table of Content form - AMENDED v4.
    /// Corresponds to Excel sheet "TABLE OF CONTENT".
    /// Sub-sections: CMM Status, Task Card list, Others list.
    ///
    /// AMENDMENTS v4:
    /// - Added workflow ownership columns so the approval chain is data-driven:
    ///   SubmittedByUserId / ReviewedByUserId / ApprovedByUserId / CurrentApproverUserId
    ///   (all long? to match User.Id), plus RejectionReason and delegation fields.
    /// - Added PreparedByUserId / ReviewedByUserId / ApprovedByUserId next to the
    ///   existing free-text signature fields, so a signature is tied to a real user.
    /// - Existing string PreparedBy / ReviewedBy / ApprovedBy fields are kept for the
    ///   printed form output and backwards compatibility.
    /// </summary>
    public class TableOfContent
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ComponentPartNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        // ===== CMM Status Section =====

        [MaxLength(200)]
        public string CMMDocumentNumber { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CMMRevision { get; set; } = string.Empty;

        public DateTime? CMMRevisionDate { get; set; }

        [MaxLength(200)]
        public string CMMPublisher { get; set; } = string.Empty;

        public ComplianceStatus CMMStatus { get; set; } = ComplianceStatus.NotReviewed;

        [MaxLength(2000)]
        public string CMMRemarks { get; set; } = string.Empty;

        // ===== Task Card Section - JSON list =====
        public string TaskCardsJson { get; set; } = "[]";

        // ===== Others Section - JSON list =====
        public string OtherDocumentsJson { get; set; } = "[]";

        // ===== Full content items - JSON list =====
        public string ContentItemsJson { get; set; } = "[]";

        // ===== Signature blocks (printed form) =====

        [MaxLength(200)]
        public string PreparedBy { get; set; } = string.Empty;

        public DateTime? PreparedDate { get; set; }

        [MaxLength(200)]
        public string ReviewedBy { get; set; } = string.Empty;

        public DateTime? ReviewedDate { get; set; }

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime? ApprovedDate { get; set; }

        // ===== AMENDED v4: workflow ownership (long? matches User.Id) =====

        /// <summary>User who prepared / created the record.</summary>
        public long? PreparedByUserId { get; set; }

        /// <summary>User who submitted the record into the approval chain.</summary>
        public long? SubmittedByUserId { get; set; }

        public DateTime? SubmittedDate { get; set; }

        /// <summary>User who performed the review stage.</summary>
        public long? ReviewedByUserId { get; set; }

        /// <summary>User who performed the final approval.</summary>
        public long? ApprovedByUserId { get; set; }

        /// <summary>
        /// The user who must act on this record right now. Resolved from the
        /// reporting chain and re-checked server side before any Approve / Reject.
        /// Drives the "Pending my approval" inbox.
        /// </summary>
        public long? CurrentApproverUserId { get; set; }

        [MaxLength(1000)]
        public string ReviewComments { get; set; } = string.Empty;

        /// <summary>Mandatory when the record is rejected.</summary>
        [MaxLength(1000)]
        public string RejectionReason { get; set; } = string.Empty;

        /// <summary>Delegation target when the current approver delegates the action.</summary>
        public long? DelegatedToUserId { get; set; }

        public DateTime? DelegatedDate { get; set; }

        [MaxLength(500)]
        public string DelegationReason { get; set; } = string.Empty;

        // ===== Approval workflow status =====
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