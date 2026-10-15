using System;
using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Domain.Models.SelfEvaluation
{
    // =====================================================================================
    // PHASE 1 — ATA RECORD GOVERNANCE
    //
    // WHY THESE FOUR TABLES EXIST
    // ---------------------------
    // (1) ATARecordSignature — THE FIX FOR REPORTED PROBLEM #1.
    //     ATARecord currently has ONE approver pair (ApprovedByUserId + ApprovalDate).
    //     Advancing a stage overwrites it, so the previous approver's Name, Date and
    //     Signature are not "rendered blank" — they are DELETED. No read-path fix can
    //     recover data the schema never kept. This table is append-only: one row per
    //     stage, superseded but never removed, exactly mirroring the semantics that
    //     UserSignatureService.StampAsync already applies to FormSignatures.
    //
    // (2) ATARecordCreationDelegation — a time-boxed, revocable create-right, so an STL
    //     can let an Engineer create records on his behalf without granting a permanent
    //     permission. Reuses the existing DelegationStatus enum; no new enum.
    //
    // (3) ATARecordAmendment — field-level before/after trail, one row per changed field.
    //     An "updated at" timestamp is not an audit trail; a regulator asks WHICH value
    //     changed, from WHAT, to WHAT, by WHOM.
    //
    // (4) ATARecordShopRouting — per-target-shop state with a resolved STL, so a record
    //     routed to several shops has one row per shop instead of one ambiguous status.
    //
    // TYPE RULES APPLIED THROUGHOUT
    //   - every user id is long   (User.Id is long)
    //   - every entity id is Guid (ATARecord.Id, Shop.Id are Guid)
    //   - SignatureBlockType and FormWorkflowCatalog.SignatureCaption are REUSED, so the
    //     printed caption of an ATA record is identical to that of a form.
    //
    // AMENDED v25 — ACCOUNTABILITY WATERMARK + REVISION MANAGEMENT
    // ------------------------------------------------------------
    // The watermark on the Record must stamp the LOGGED-IN USER's identity exactly as
    // "Created by — signature", with name, date, role and signature specimen frozen at
    // the moment of the action. That watermark line IS an ATARecordSignature row with
    // Block = PreparedBy and BlockCaption = "Created by" (see ATARecordWatermark below).
    //
    // When the Shop Team Leader starts a new revision on a completed record:
    //   - every current signature line is SUPERSEDED (IsCurrent=false, SupersededAt,
    //     SupersededReason = "Revision vN started by ...") — never deleted (R1/R2);
    //   - the fresh revision gets its own "Created by — signature" line for the user who
    //     opened it, carrying the new RecordRevisionNumber;
    //   - the revision itself is written to the amendment trail (FieldName "RevisionNumber",
    //     OldValue "Revision v1", NewValue "Revision v2"), so the audit trail names WHO
    //     started it, WHEN, and WHY.
    // =====================================================================================

    /// <summary>
    /// AMENDED v25 — the single source of truth for the accountability watermark text and
    /// the tamper-evidence hash of a watermark / signature line.
    ///
    /// The requirement is literal: the watermark must read "Created by — signature" with
    /// the LOGGED-IN USER's actual name, date, role and signature specimen underneath.
    /// These constants keep that wording identical everywhere the record is rendered
    /// (screen watermark, PDF export, signature trail component).
    /// </summary>
    public static class ATARecordWatermark
    {
        /// <summary>The exact caption of the creator watermark line: "Created by".</summary>
        public const string CreatedByCaption = "Created by";

        /// <summary>Caption used when the creator line is re-stamped after an amendment.</summary>
        public const string EditedByCaption = "Edited by";

        /// <summary>FieldName used on the amendment trail row that marks a revision start.</summary>
        public const string RevisionFieldName = "RevisionNumber";

        /// <summary>FieldLabel printed for that amendment row.</summary>
        public const string RevisionFieldLabel = "Revision";

        /// <summary>
        /// SHA-256 over recordId|stageOrder|userId|signedAt|fileSha256 — the documented
        /// hash formula of ATARecordSignature.SignatureHash. Lower-case hex.
        /// </summary>
        public static string BuildHash(
            Guid recordId,
            int stageOrder,
            long? userId,
            DateTime signedAt,
            string? fileSha256)
        {
            var payload =
                $"{recordId}|{stageOrder}|{userId?.ToString() ?? "-"}|{signedAt:O}|{fileSha256 ?? "-"}";

            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }

    /// <summary>
    /// One frozen line of an ATA record's signature block. APPEND ONLY.
    ///
    /// INVARIANTS — a reviewer should be able to check these by reading the code:
    ///   R1. A row is NEVER deleted and NEVER updated once IsCurrent is set to false.
    ///   R2. Advancing a stage INSERTS a new row; it does not touch earlier rows except
    ///       to set IsCurrent = false and stamp SupersededAt / SupersededReason.
    ///   R3. Reading the trail returns EVERY row, ordered by StageOrder then SignedAt.
    ///       Filtering to IsCurrent = true is a DEFECT: it reproduces the blank-approver
    ///       bug this table exists to eliminate.
    ///   R4 (v25): the creator watermark line is the row with Block = PreparedBy and
    ///       BlockCaption = "Created by". It is written on CREATE with the logged-in
    ///       user's frozen name, canonical role, UTC date and ACTIVE signature specimen,
    ///       and carries the RecordRevisionNumber of the revision it belongs to.
    /// </summary>
    public class ATARecordSignature
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        /// <summary>Position in the chain. 0 = the drafting / PreparedBy stage.</summary>
        public int StageOrder { get; set; }

        /// <summary>Status the record sat in WHILE this stage was pending.</summary>
        public ApprovalStatus StageStatus { get; set; }

        /// <summary>Status the record moved to when this stage was signed.</summary>
        public ApprovalStatus ResultingStatus { get; set; }

        /// <summary>Reused from the form engine, so captions match the printed forms.</summary>
        public SignatureBlockType Block { get; set; }

        /// <summary>
        /// "Created by" / "Prepared by" / "Reviewed by" / "Approved by". From
        /// FormWorkflowCatalog, except the creator watermark line, which uses
        /// ATARecordWatermark.CreatedByCaption ("Created by") verbatim.
        /// </summary>
        [MaxLength(50)]
        public string BlockCaption { get; set; } = string.Empty;

        // ----- Identity, frozen at signing time -----

        public long? UserId { get; set; }

        [MaxLength(200)]
        public string PersonName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value AT SIGNING TIME.</summary>
        [MaxLength(50)]
        public string PersonRole { get; set; } = string.Empty;

        /// <summary>Printed label, e.g. "Shop Team Leader".</summary>
        [MaxLength(100)]
        public string PersonRoleLabel { get; set; } = string.Empty;

        public DateTime SignedAt { get; set; } = DateTime.UtcNow;

        // ----- Specimen image, resolved by user id at signing time -----

        public Guid? UserSignatureId { get; set; }

        [MaxLength(1000)]
        public string? SignatureStoragePath { get; set; }

        [MaxLength(500)]
        public string? SignatureFileName { get; set; }

        [MaxLength(200)]
        public string? SignatureContentType { get; set; }

        [MaxLength(128)]
        public string? SignatureFileSha256 { get; set; }

        /// <summary>
        /// False when the signer had no specimen on file. The approval is still VALID:
        /// name, role and date were recorded. Only the image is missing.
        /// </summary>
        public bool SignatureImageApplied { get; set; }

        /// <summary>SHA-256 over recordId|stageOrder|userId|signedAt|fileSha256.</summary>
        [MaxLength(128)]
        public string SignatureHash { get; set; } = string.Empty;

        // ----- Decision -----

        public WorkflowStepAction ActionTaken { get; set; } = WorkflowStepAction.Approved;

        [MaxLength(1000)]
        public string Comments { get; set; } = string.Empty;

        // ----- Supersede, never delete (R1/R2) -----

        /// <summary>
        /// True for the latest row of this block. Historical rows keep all their data and
        /// MUST still be rendered. This flag exists only to identify the newest line of a
        /// re-signed block, never to filter the trail.
        /// </summary>
        public bool IsCurrent { get; set; } = true;

        public DateTime? SupersededAt { get; set; }

        [MaxLength(500)]
        public string SupersededReason { get; set; } = string.Empty;

        /// <summary>
        /// Revision of the record when this line was signed. AMENDED v25: the trail is
        /// grouped by this value so the UI can render "Revision v1" lines and "Revision v2"
        /// lines side by side after the approval workflow restarts.
        /// </summary>
        public int RecordRevisionNumber { get; set; } = 1;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ATARecord Record { get; set; } = null!;
    }

    /// <summary>
    /// A time-boxed, revocable right to CREATE ATA records on behalf of a delegator.
    /// Reuses <see cref="DelegationStatus"/>; deliberately no new enum.
    /// </summary>
    public class ATARecordCreationDelegation
    {
        public Guid Id { get; set; }

        /// <summary>Who granted the right. Must hold Permissions.CreateATARecord.</summary>
        public long DelegatorUserId { get; set; }

        [MaxLength(200)]
        public string DelegatorName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string DelegatorRole { get; set; } = string.Empty;

        /// <summary>Who received it.</summary>
        public long DelegateUserId { get; set; }

        [MaxLength(200)]
        public string DelegateName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string DelegateRole { get; set; } = string.Empty;

        /// <summary>Scope. Null = every shop the delegator can reach.</summary>
        public Guid? ShopId { get; set; }

        public DelegationStatus Status { get; set; } = DelegationStatus.Active;

        public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;

        /// <summary>Hard stop. Null = open-ended, discouraged; the UI should require a date.</summary>
        public DateTime? ExpiresAt { get; set; }

        /// <summary>0 = unlimited. Otherwise the delegation expires when the cap is reached.</summary>
        public int MaxRecords { get; set; }

        public int RecordsCreated { get; set; }

        public long? RevokedByUserId { get; set; }
        public DateTime? RevokedAt { get; set; }

        [MaxLength(500)]
        public string RevokeReason { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Reason { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Usable right now: Active, inside its window, and under its cap.
        /// The authorization service calls this and NEVER re-implements the rule.
        /// </summary>
        public bool IsUsableAt(DateTime utcNow) =>
            Status == DelegationStatus.Active
            && utcNow >= EffectiveFrom
            && (!ExpiresAt.HasValue || utcNow <= ExpiresAt.Value)
            && (MaxRecords <= 0 || RecordsCreated < MaxRecords);
    }

    /// <summary>
    /// One changed field of an ATA record. One row per field, never batched.
    ///
    /// AMENDED v25: this trail is what makes the requirement "if any amendments occur
    /// after editing, they are properly recorded with the editor's identity based on the
    /// logged-in user" real: every Update writes one row per changed field with the
    /// acting user's id, name and canonical role frozen at amendment time, the status the
    /// record was in, and whether the change invalidated an approval (IsPostApproval).
    /// A revision start is recorded here too (FieldName = ATARecordWatermark.RevisionFieldName).
    /// </summary>
    public class ATARecordAmendment
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        /// <summary>Sequence within the record, starting at 1.</summary>
        public int Sequence { get; set; }

        /// <summary>Amendment cycle this change belongs to.</summary>
        public int RecordRevisionNumber { get; set; } = 1;

        /// <summary>CLR property name, e.g. "PartNumber". Stable across UI relabelling.</summary>
        [Required]
        [MaxLength(100)]
        public string FieldName { get; set; } = string.Empty;

        /// <summary>Printed label, e.g. "P/N".</summary>
        [MaxLength(200)]
        public string FieldLabel { get; set; } = string.Empty;

        [MaxLength(4000)]
        public string? OldValue { get; set; }

        [MaxLength(4000)]
        public string? NewValue { get; set; }

        public long AmendedByUserId { get; set; }

        [MaxLength(200)]
        public string AmendedByName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string AmendedByRole { get; set; } = string.Empty;

        public DateTime AmendedAt { get; set; } = DateTime.UtcNow;

        /// <summary>Status of the record when the change was made.</summary>
        public ApprovalStatus StatusAtAmendment { get; set; }

        /// <summary>
        /// True when the change happened AFTER first approval, i.e. it invalidates an
        /// existing signature and requires re-approval.
        /// </summary>
        public bool IsPostApproval { get; set; }

        [MaxLength(1000)]
        public string Reason { get; set; } = string.Empty;

        public ATARecord Record { get; set; } = null!;
    }

    /// <summary>Per-target-shop state of a routed ATA record.</summary>
    public class ATARecordShopRouting
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }

        /// <summary>Target shop. Stored as an ID, never a name.</summary>
        public Guid TargetShopId { get; set; }

        [MaxLength(200)]
        public string TargetShopName { get; set; } = string.Empty;

        public bool IsPrimaryTarget { get; set; }

        // ----- Resolved responsible STL (needs D5 to be fixed first) -----

        /// <summary>
        /// STL resolved from Shop.TeamLeaderUserId at routing time.
        /// Null means the shop has no active STL — surface that as a warning, do not
        /// silently drop the routing row.
        /// </summary>
        public long? ResolvedTeamLeaderUserId { get; set; }

        [MaxLength(200)]
        public string ResolvedTeamLeaderName { get; set; } = string.Empty;

        public bool HasActiveTeamLeader { get; set; }

        // ----- Lifecycle -----

        public ApprovalStatus Status { get; set; } = ApprovalStatus.PendingAssignment;

        public DateTime RoutedAt { get; set; } = DateTime.UtcNow;

        public long RoutedByUserId { get; set; }

        public DateTime? AcknowledgedAt { get; set; }
        public long? AcknowledgedByUserId { get; set; }

        public DateTime? CompletedAt { get; set; }
        public long? CompletedByUserId { get; set; }

        /// <summary>
        /// The parent record becomes Approved only when EVERY active routing row is
        /// complete. Recomputed by IATARecordRoutingService, never by a client.
        /// </summary>
        public bool IsComplete { get; set; }

        /// <summary>False when the routing was withdrawn. Kept for the audit trail.</summary>
        public bool IsActive { get; set; } = true;

        [MaxLength(1000)]
        public string Notes { get; set; } = string.Empty;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public ATARecord Record { get; set; } = null!;
    }
}
