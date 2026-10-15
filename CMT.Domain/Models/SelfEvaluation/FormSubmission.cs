using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// Represents a submitted form (child) within an ATA Record - AMENDED v4.
    ///
    /// AMENDMENTS v4:
    /// - SubmittedByUserId / ReviewedByUserId / ApprovedByUserId / DelegatedToUserId
    ///   changed from Guid? to long? so they match User.Id (long). Posting a numeric
    ///   user id into a Guid? column was the same class of model-binding failure that
    ///   produced 400 application/problem+json on the user endpoints.
    /// - Added CurrentApproverUserId so the "Pending my approval" inbox is a cheap
    ///   indexed lookup instead of a hierarchy walk on every request.
    /// - Added ShopId so approvals can be scoped per shop (several Shop Team Leaders
    ///   may share one shop and therefore share the shop's data scope).
    ///
    /// Each form type corresponds to a specific Excel sheet format:
    /// - capability_self_evaluation (DATA INPUT sheet)
    /// - periodic_self_audit (self audit form sheet)
    /// - confirmation_letter
    /// - request_letter (REQUEST LETTER sheet)
    /// - table_of_content (TABLE OF CONTENT sheet)
    /// - 918_faa (918 FAA sheet)
    /// - 918a_caa (918A CAA sheet)
    /// - sb (SB sheet)
    /// - ad (AD sheet)
    /// - similar_technology (SEPARETOR01 sheet)
    /// - tna
    /// - tool_need_analysis_report (25- sheet)
    /// - alternate_tools_equivalency
    /// - inhouse_manufactured_tools
    /// - repair_facility_evaluation
    /// - cleaning_facility_evaluation
    /// - environmental_facility_evaluation
    /// - list_of_consumables
    /// - alternate_consumable_declaration
    /// - component_maintenance_training
    /// - inspector_proficiency
    /// - competency_assessment
    /// </summary>
    public class FormSubmission
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        /// <summary>AMENDED v4: shop scope of the submission.</summary>
        public Guid? ShopId { get; set; }

        /// <summary>Approved master form from which this ATA inherited its data.</summary>
        public Guid? SourceFormSubmissionId { get; set; }

        [Required]
        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty; // Maps to FormNodeType

        [MaxLength(50)]
        public string FormNo { get; set; } = string.Empty;

        [MaxLength(20)]
        public string RevNo { get; set; } = string.Empty;

        public DateTime? RevDate { get; set; }

        /// <summary>
        /// JSON-serialized form data specific to the form type.
        /// </summary>
        public string FormDataJson { get; set; } = "{}";

        // ===== Approval workflow =====

        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        /// <summary>AMENDED v4: long? (was Guid?).</summary>
        public long? SubmittedByUserId { get; set; }
        public DateTime? SubmittedDate { get; set; }

        /// <summary>AMENDED v4: long? (was Guid?).</summary>
        public long? ReviewedByUserId { get; set; }
        public DateTime? ReviewedDate { get; set; }

        [MaxLength(1000)]
        public string ReviewComments { get; set; } = string.Empty;

        /// <summary>AMENDED v4: long? (was Guid?).</summary>
        public long? ApprovedByUserId { get; set; }
        public DateTime? ApprovedDate { get; set; }

        [MaxLength(1000)]
        public string RejectionReason { get; set; } = string.Empty;

        /// <summary>
        /// AMENDED v4: the user who must act on this record right now.
        /// Resolved from the hierarchy on submit / approve and re-checked server side.
        /// </summary>
        public long? CurrentApproverUserId { get; set; }

        // ===== AMENDED v13: upload lock on completion =====
        // Set to LockedByCompletion when the final approval/sign-off closes the form.
        // Uploads are then refused unless an active FormUploadGrant (granted by an
        // Admin) or the Admin break-glass path applies.

        public UploadLockState UploadLock { get; set; } = UploadLockState.Open;
        public DateTime? UploadLockedAt { get; set; }
        public long? UploadLockedByUserId { get; set; }

        // AMENDED v13: SHA-256 tamper-evidence stamp written at final sign-off
        // (formId | finalStepNo | userId | signedAt). Empty until the form completes.
        [MaxLength(128)]
        public string ApprovalSignatureHash { get; set; } = string.Empty;

        // ===== Delegation support =====

        /// <summary>AMENDED v4: long? (was Guid?).</summary>
        public long? DelegatedToUserId { get; set; }
        public DateTime? DelegatedDate { get; set; }

        [MaxLength(500)]
        public string DelegationReason { get; set; } = string.Empty;

        public int RevisionNumber { get; set; } = 1;
        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord ATARecord { get; set; } = null!;
        public ICollection<FormFileAttachment> FileAttachments { get; set; } = new List<FormFileAttachment>();
    }
}