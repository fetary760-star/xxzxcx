using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// ATA Record - the parent entity in the self-evaluation hierarchy.
    /// Created by a Shop Team Leader under a specific shop and ATA chapter.
    /// Contains full metadata: DESCRIPTION, P/N, SELF-EVALUATION DATE, MANUFACTURER, ATA,
    /// CMM REV DATE, REV.No, A/C, ECAA SHOP, FAA SHOP, Letter Ref: No, SHOP, EASA
    ///
    /// AMENDED v4:
    /// - Added Authority (Shop Capability) field - supports multiple comma-separated values (ECAA, FAA, EASA).
    /// - Added ResponsibleWorkshop field - supports multiple comma-separated values (Galley, Electric, etc.).
    /// - ATAChapterId and ComponentId are NULLABLE (Guid?) to allow creating ATA records without
    ///   requiring a pre-existing chapter or component.
    /// - Added CMMPdfUrl field to persist CMM PDF link from external system.
    /// - Added EASA field for European Aviation Safety Agency capability.
    ///
    /// AMENDED v25 (ATA RECORD WORKFLOW — WATERMARK + REVISION MANAGEMENT):
    /// - Added the NotMapped RevisionLabel helper so every read path prints the revision
    ///   exactly as "Revision v1" / "Revision v2" ... under the Record, in ONE place.
    /// - RevisionNumber is now the revision counter the Shop Team Leader drives:
    ///   starting a revision on a completed (Approved) record increments it and resets
    ///   the whole approval chain (see ATARecordCommandHandler.StartRevision and
    ///   ATARecordWorkflowCatalog.RevisionLabel).
    /// - No new columns were added: the creator watermark identity (CreatedBy,
    ///   CreatedByUserId, CreatorRole), the editor identity (UpdatedBy / UpdatedAt) and
    ///   the per-stage signature lines (Signatures) already exist. The watermark is now
    ///   actually STAMPED with the logged-in user's frozen name, role, date and signature
    ///   specimen on create / edit / approve / confirm / return / reject, and every
    ///   amendment is written to the ATARecordAmendment trail with the editor's identity.
    ///
    /// Hierarchical Structure:
    /// Shop → ATA Record (parent) → Form Submissions (children)
    /// Each ATA Record can have multiple child forms organized by the TABLE OF CONTENT structure:
    ///   - DOCUMENTATION (CMM Rev Status, Task Card, Periodic Self-Audit, SB, AD, 918 FAA, 918A CAA)
    ///   - TRAINING DOCUMENT (Component Maintenance, Inspector Proficiency, Competency Assessment, Similar Technology)
    ///   - TOOLS AND EQUIPMENT (TNA, Tool Need Analysis Report, Alternate Tools, In-house Tools)
    ///   - FACILITY REQUIREMENT (Repair, Cleaning, Environmental)
    ///   - CONSUMABLES (List of Consumables, Alternate Consumable Declaration)
    /// </summary>
    public class ATARecord
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string PartNumber { get; set; } = string.Empty;

        public DateTime? SelfEvaluationDate { get; set; }

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        [MaxLength(10)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CMMRevDate { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevNo { get; set; } = string.Empty;

        /// <summary>
        /// Stores the CMM PDF URL from the external system.
        /// </summary>
        [MaxLength(1000)]
        public string CMMPdfUrl { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Aircraft { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ECAAShop { get; set; } = string.Empty;

        [MaxLength(100)]
        public string FAAShop { get; set; } = string.Empty;

        [MaxLength(100)]
        public string LetterRefNo { get; set; } = string.Empty;

        // ===== CAPABILITY AND WORKSHOP FIELDS =====

        /// <summary>
        /// EASA capability indicator.
        /// </summary>
        [MaxLength(100)]
        public string EASA { get; set; } = string.Empty;

        /// <summary>
        /// Shop Capability / Authority - comma-separated for multiple selections.
        /// Possible values: "ECAA", "FAA", "EASA" or combinations like "ECAA,FAA,EASA"
        /// Used for dashboard filter: ALL | ECAA | FAA | EASA (with counts)
        /// </summary>
        [MaxLength(100)]
        public string Authority { get; set; } = string.Empty;

        /// <summary>
        /// Responsible Workshop - comma-separated for multiple selections.
        /// Possible values: "Galley", "Electric", "Wheel", "Emergency", "Avionics", etc.
        /// Used for dashboard filter: ALL | Galley | Electric (with counts)
        /// </summary>
        [MaxLength(200)]
        public string ResponsibleWorkshop { get; set; } = string.Empty;

        // ===== FOREIGN KEYS =====

        public Guid ShopId { get; set; }

        /// <summary>
        /// Nullable - allows creation without selecting a chapter.
        /// </summary>
        public Guid? ATAChapterId { get; set; }

        /// <summary>
        /// Nullable - allows creation without linking a component.
        /// </summary>
        public Guid? ComponentId { get; set; }

        // ===== PHASE 1: OPTIONAL-STAGE FLAGS =====
        // The default chain is Prepared -> Shop Team Leader -> Manager. These flags are
        // the ONLY way a record opts into the extra signing stages, which is what keeps
        // Director / QA / ECAA out of the default path (requirement: "without requiring
        // Director approval unless specified"). ATARecordWorkflowCatalog.ChainFor reads
        // exactly these three booleans.

        /// <summary>True to append the optional QA approval stage after Manager.</summary>
        public bool RequiresQAApproval { get; set; }

        /// <summary>True to append the optional Director approval stage.</summary>
        public bool RequiresDirectorApproval { get; set; }

        /// <summary>True to append the optional ECAA endorsement stage.</summary>
        public bool RequiresECAAEndorsement { get; set; }

        // ===== APPROVAL WORKFLOW =====

        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        // ===== PHASE 0 RETYPE: user ids are long, never Guid =====
        // User.Id is long (User : BaseEntity). Your v4 amendment already retyped
        // User.SupervisorUserId for this reason; these two were missed, which is why
        // ApprovedByUserId could never be written (see defect D1).

        /// <summary>Assignee. Retyped from Guid? in Phase 0.</summary>
        public long? AssignedToUserId { get; set; }

        /// <summary>Final approver. Retyped from Guid? in Phase 0.</summary>
        public long? ApprovedByUserId { get; set; }

        public DateTime? ApprovalDate { get; set; }

        // ---- Transitional columns, present only between Phase0a and Phase0b ----
        // Uncomment for the duration of the migration, then delete with Phase0b.
        // public Guid? AssignedToUserIdLegacy { get; set; }
        // public Guid? ApprovedByUserIdLegacy { get; set; }

        [MaxLength(1000)]
        public string RejectionReason { get; set; } = string.Empty;

        /// <summary>
        /// AMENDED v25: the REVISION counter of the record, surfaced under the Record as
        /// "Revision v1", "Revision v2" ... (see RevisionLabel). It starts at 1 and is
        /// incremented ONLY by the Shop Team Leader starting a revision on a completed
        /// (Approved) record. Starting a revision also resets ApprovalStatus to Draft and
        /// returns every Table-of-Content form to its initial approval state, so all roles
        /// must re-approve the content (requirement: "the approval workflow must restart
        /// for all roles and Table of Contents sections once the revision is initiated").
        /// </summary>
        public int RevisionNumber { get; set; } = 1;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        /// <summary>
        /// PHASE 1: the authenticated user id that created the record. long, never Guid
        /// (User.Id is long). The authorization service uses this to decide whether the
        /// caller is the assigned preparer (Edit / Submit rights). Indexed with CreatedAt
        /// by ApplicationDbContext ("Engineer's records" hot path).
        /// </summary>
        public long? CreatedByUserId { get; set; }

        /// <summary>
        /// PHASE 1: canonical OrgRoles value of the creator AT CREATION TIME, frozen so
        /// the "Prepared by" caption stays truthful even if the user's role changes later.
        /// AMENDED v25: this frozen identity is also what the "Created by — signature"
        /// watermark stamp reads, together with the creator's ACTIVE signature specimen
        /// resolved by CreatedByUserId at creation time.
        /// </summary>
        [MaxLength(50)]
        public string CreatorRole { get; set; } = string.Empty;

        // ===== COMPUTED (never mapped, no migration triggered) =====

        /// <summary>
        /// AMENDED v25: the printed revision label of the record — "Revision v1",
        /// "Revision v2" ... Single source of truth so the Record header, the watermark
        /// and the signature trail all render the same string.
        /// </summary>
        [NotMapped]
        public string RevisionLabel => ATARecordWorkflowCatalog.RevisionLabel(RevisionNumber);

        // ===== NAVIGATION PROPERTIES =====

        public Shop Shop { get; set; } = null!;
        public ATAChapter? ATAChapter { get; set; }
        public Component? Component { get; set; }

        /// <summary>
        /// Child form submissions organized by the TABLE OF CONTENT structure.
        /// </summary>
        public ICollection<FormSubmission> FormSubmissions { get; set; } = new List<FormSubmission>();
        public ICollection<FormFileAttachment> FileAttachments { get; set; } = new List<FormFileAttachment>();

        // ===== PHASE 1: GOVERNANCE NAVIGATIONS =====
        // Mapped in ApplicationDbContext.ConfigureATARecordGovernance. All three are
        // append-only audit collections: rows are superseded, never deleted, so the
        // full approval trail survives every stage advance (fix for problem #1).
        //
        // AMENDED v25: the Signatures collection is ALSO what powers the accountability
        // watermark — the "Created by — signature" line is a real ATARecordSignature row
        // frozen with the logged-in user's name, role, date and signature specimen.

        /// <summary>One row per signed stage. Read ALL of them, never filter to IsCurrent.</summary>
        public ICollection<ATARecordSignature> Signatures { get; set; } = new List<ATARecordSignature>();

        /// <summary>Field-level before/after trail, one row per changed field.</summary>
        public ICollection<ATARecordAmendment> Amendments { get; set; } = new List<ATARecordAmendment>();

        /// <summary>Per-target-shop routing state with the resolved responsible STL.</summary>
        public ICollection<ATARecordShopRouting> ShopRoutings { get; set; } = new List<ATARecordShopRouting>();
    }
}
