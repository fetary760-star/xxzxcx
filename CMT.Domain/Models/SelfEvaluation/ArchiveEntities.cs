using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    // =====================================================================================
    // AMENDED v14 - FEATURE 1: ARCHIVE & SOFT-DELETE
    //
    // REQUIREMENT, VERBATIM
    //   "For records revoked or deleted - commonly by the QA Manager, ECAA, or Director
    //    roles: implement a 'soft delete' or status flag logic so data is never permanently
    //    lost. Automatically move these revoked/deleted items to a newly created Archive
    //    section in the sidebar. Allow authorized users to edit archived items and restore
    //    them to the main capability list to restart the approval workflow when needed."
    //
    // WHY A NEW TABLE IS UNAVOIDABLE
    // ------------------------------
    // The schema already has the three ingredients of a soft delete, but NOT the archive:
    //   - ATARecord.IsActive (bool)          -> can hide a row from the main list;
    //   - ApprovalStatus.Revoked (= 32)      -> can mark the approval as withdrawn;
    //   - RecordStatus.Deleted (= 2)         -> exists, but only Users carry that column.
    //
    // What none of them can answer is the set of questions the Archive sidebar has to
    // answer for a regulator:
    //   WHO revoked it, WHEN, UNDER WHICH ROLE, WHY, WHAT STATUS was destroyed by the
    //   revocation, and - after a restore - WHAT the record went back to.
    // Flipping IsActive to false answers none of those, and the moment a second revoke /
    // restore cycle happens a single set of columns on ATARecord would be overwritten:
    // exactly the data-loss pattern that ATARecordSignature was created to end.
    //
    // Therefore ArchiveEntry is an APPEND-ONLY INDEX, one row per archive event, with the
    // restore recorded ON THE SAME ROW so a cycle is always readable as a pair.
    //
    // INVARIANTS
    //   A1. An ArchiveEntry row is NEVER deleted. "Purge" is a request flag, never a DELETE.
    //   A2. Archiving NEVER deletes the underlying ATARecord / FormSubmission row. It sets
    //       IsActive = false and stamps ApprovalStatus = Revoked (see ArchivePolicy).
    //   A3. StatusBeforeArchive is written BEFORE the status is overwritten, so a restore
    //       can be audited against the status the record actually held.
    //   A4. A restore does NOT return the record to StatusBeforeArchive. It returns it to
    //       Draft and bumps RevisionNumber, because the requirement says the workflow must
    //       RESTART - a revoked approval must never silently come back to life.
    //   A5. Editing while archived is allowed and is recorded on the entry, so an edit can
    //       never be mistaken for an untouched restore.
    //
    // TYPE RULES (identical to ATARecordGovernance.cs)
    //   - user ids are long   (User.Id is long)
    //   - entity ids are Guid (ATARecord.Id, Shop.Id are Guid)
    //   - no new enum is introduced where an existing one already fits
    // =====================================================================================

    /// <summary>
    /// What kind of item an <see cref="ArchiveEntry"/> points at.
    /// Kept deliberately small: these are the three things the Table Of Contents renders.
    /// </summary>
    public enum ArchivedItemKind
    {
        /// <summary>A whole ATA record and, by containment, its child forms.</summary>
        ATARecord = 0,

        /// <summary>A single catalogued form (FormSubmission) inside an ATA record.</summary>
        Form = 1,

        /// <summary>A whole evaluation folder.</summary>
        EvaluationFolder = 2
    }

    /// <summary>
    /// Why the item left the main capability list. Distinguishes the two doors named by the
    /// requirement ("revoked or deleted") plus the three lifecycle doors that already exist
    /// in the workflow engine.
    /// </summary>
    public enum ArchiveTrigger
    {
        /// <summary>An approval was withdrawn after being granted (ApprovalStatus.Revoked).</summary>
        Revoked = 0,

        /// <summary>An authorized role deleted the item; soft delete, data retained.</summary>
        Deleted = 1,

        /// <summary>Replaced by a newer revision of the same capability.</summary>
        Superseded = 2,

        /// <summary>Pulled out of the active list because of an audit finding.</summary>
        AuditFinding = 3,

        /// <summary>Archived after an expiry was never amended.</summary>
        Expired = 4
    }

    /// <summary>Lifecycle of the archive row itself.</summary>
    public enum ArchiveEntryState
    {
        /// <summary>Currently sitting in the Archive sidebar section.</summary>
        Archived = 0,

        /// <summary>Restored to the main capability list; the row is kept as history.</summary>
        Restored = 1,

        /// <summary>
        /// A permanent deletion was REQUESTED. Nothing is deleted by this flag: it exists so
        /// a purge can be reviewed, and so "never permanently lost" stays true by default.
        /// </summary>
        PurgeRequested = 2
    }

    /// <summary>
    /// Sidebar sections that are NOT form sections of the Table Of Contents.
    ///
    /// Deliberately declared here instead of being appended to
    /// <c>CMT.Domain.Models.Workflow.ToCSections.Ordered</c>: that array drives per-form
    /// catalog aggregation and validation, and the Archive is a VIEW over revoked items
    /// rather than a section that owns catalogued forms. Adding it there would invent a
    /// twelfth form section that no FormWorkflowDefinition can ever populate.
    /// </summary>
    public static class SidebarSections
    {
        /// <summary>Stable code of the new Archive section required by the amendment.</summary>
        public const string Archive = "ARCHIVE";

        /// <summary>Printed title of the Archive section.</summary>
        public const string ArchiveTitle = "ARCHIVE";

        /// <summary>
        /// Order used by the sidebar. 12 places it directly after FINAL SIGN-OFF (11), i.e.
        /// at the bottom of the tree, which is where an archive belongs.
        /// </summary>
        public const int ArchiveOrder = 12;
    }

    /// <summary>
    /// One archive event. APPEND ONLY - see invariant A1.
    ///
    /// Reading rules for the Archive sidebar:
    ///   - the Archive list  = rows with <see cref="State"/> == Archived
    ///   - the audit history = ALL rows, including Restored ones
    /// Filtering the history to Archived rows only is a DEFECT: it hides completed
    /// revoke/restore cycles, which are precisely what an auditor asks for.
    /// </summary>
    public class ArchiveEntry
    {
        public Guid Id { get; set; }

        // ----- What was archived -----

        public ArchivedItemKind ItemKind { get; set; } = ArchivedItemKind.ATARecord;

        /// <summary>
        /// Primary key of the archived item, whatever its kind. Kept as a bare Guid so a
        /// form or a folder can be archived without three nullable foreign keys.
        /// </summary>
        public Guid ItemId { get; set; }

        /// <summary>
        /// Owning ATA record when the item is an ATA record or one of its forms. Null for a
        /// folder-level archive. Present so the Archive can be filtered per ATA chapter
        /// without a second query.
        /// </summary>
        public Guid? ATARecordId { get; set; }

        // ----- Display snapshot, frozen at archive time -----
        // Frozen on purpose: the Archive must stay readable even if the underlying row is
        // later edited (which invariant A5 explicitly permits).

        [MaxLength(500)]
        public string ItemTitle { get; set; } = string.Empty;

        /// <summary>P/N for an ATA record, FormNo (e.g. "MNT-918") for a form.</summary>
        [MaxLength(200)]
        public string ItemReference { get; set; } = string.Empty;

        /// <summary>ToCSections code the item belonged to, for grouping inside the Archive.</summary>
        [MaxLength(100)]
        public string SectionCode { get; set; } = string.Empty;

        [MaxLength(100)]
        public string FormType { get; set; } = string.Empty;

        [MaxLength(10)]
        public string ATAChapterCode { get; set; } = string.Empty;

        public Guid? ShopId { get; set; }

        [MaxLength(200)]
        public string ShopName { get; set; } = string.Empty;

        // ----- State destroyed by the archive (invariant A3) -----

        /// <summary>Status the item held immediately BEFORE it was archived.</summary>
        public ApprovalStatus StatusBeforeArchive { get; set; }

        /// <summary>Human readable form of <see cref="StatusBeforeArchive"/>, frozen.</summary>
        [MaxLength(100)]
        public string StatusBeforeArchiveLabel { get; set; } = string.Empty;

        /// <summary>Revision number the item held before it was archived.</summary>
        public int RevisionNumberBeforeArchive { get; set; } = 1;

        /// <summary>
        /// True when the item had already reached a terminal approved state before being
        /// archived. Those are the rows an auditor looks at first: an approval was undone.
        /// </summary>
        public bool WasApprovedBeforeArchive { get; set; }

        // ----- Who archived it -----

        public ArchiveTrigger Trigger { get; set; } = ArchiveTrigger.Revoked;

        public long ArchivedByUserId { get; set; }

        [MaxLength(200)]
        public string ArchivedByName { get; set; } = string.Empty;

        /// <summary>Canonical OrgRoles value AT ARCHIVE TIME (Director / QAPersonnel / ECAAPersonnel / Admin).</summary>
        [MaxLength(50)]
        public string ArchivedByRole { get; set; } = string.Empty;

        public DateTime ArchivedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Mandatory justification. ArchivePolicy refuses an archive without it: a revoked
        /// approval with no recorded reason is an audit finding in itself.
        /// </summary>
        [MaxLength(1000)]
        public string Reason { get; set; } = string.Empty;

        // ----- Archive row lifecycle -----

        public ArchiveEntryState State { get; set; } = ArchiveEntryState.Archived;

        // ----- Edits performed while archived (invariant A5) -----

        /// <summary>True once the item was edited while it sat in the Archive.</summary>
        public bool EditedWhileArchived { get; set; }

        public DateTime? LastEditedWhileArchivedAt { get; set; }

        public long? LastEditedWhileArchivedByUserId { get; set; }

        [MaxLength(200)]
        public string LastEditedWhileArchivedByName { get; set; } = string.Empty;

        /// <summary>How many separate edits happened while archived.</summary>
        public int EditsWhileArchived { get; set; }

        // ----- Restore, recorded on the same row (invariant A4) -----

        public long? RestoredByUserId { get; set; }

        [MaxLength(200)]
        public string RestoredByName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RestoredByRole { get; set; } = string.Empty;

        public DateTime? RestoredAt { get; set; }

        [MaxLength(1000)]
        public string RestoreReason { get; set; } = string.Empty;

        /// <summary>
        /// Status the item was set to by the restore. Per invariant A4 this is
        /// ApprovalStatus.Draft, never StatusBeforeArchive.
        /// </summary>
        public ApprovalStatus? StatusAfterRestore { get; set; }

        /// <summary>Revision number after the restore bumped it.</summary>
        public int? RevisionNumberAfterRestore { get; set; }

        // ----- Purge request (never an actual delete) -----

        public long? PurgeRequestedByUserId { get; set; }

        public DateTime? PurgeRequestedAt { get; set; }

        [MaxLength(1000)]
        public string PurgeRequestReason { get; set; } = string.Empty;

        // ----- Bookkeeping -----

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // ----- Derived helpers used by the read path and by ArchivePolicy -----

        /// <summary>Currently visible in the Archive sidebar section.</summary>
        public bool IsCurrentlyArchived => State == ArchiveEntryState.Archived;

        /// <summary>
        /// A restore is possible only from the Archived state. A row already restored is
        /// history; re-restoring it would double-bump the revision number.
        /// </summary>
        public bool IsRestorable => State == ArchiveEntryState.Archived;

        /// <summary>True when this row records a completed revoke -> restore cycle.</summary>
        public bool IsCompletedCycle => State == ArchiveEntryState.Restored && RestoredAt.HasValue;

        /// <summary>Days the item has been sitting in the Archive, for the sidebar counter.</summary>
        public int DaysArchived(DateTime utcNow) =>
            (int)Math.Max(0, ((RestoredAt ?? utcNow) - ArchivedAt).TotalDays);
    }
}