using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    // =====================================================================================
    // AMENDED v14 - FEATURE 1 (part 2 of 2): ARCHIVE AUTHORIZATION AND TRANSITIONS
    //
    // This file holds the DECISION and the MUTATION for the archive feature. It is pure
    // domain logic: no DbContext, no HTTP, no I/O. That is deliberate - the same rules must
    // hold for the controller, a background expiry job and a unit test, and the only way to
    // guarantee that is to have exactly one implementation.
    //
    // ROLE MAPPING - READ THIS BEFORE CHANGING THE AUTHORITY LIST
    //   The requirement names "the QA Manager, ECAA, or Director roles". In this solution:
    //     "QA Manager" -> OrgRoles.QAPersonnel      (legacy spelling UserRoles.QAManager = "qa_manager")
    //     "ECAA"       -> OrgRoles.ECAAPersonnel    (legacy spelling UserRoles.ECAAPersonnel = "ecaa")
    //     "Director"   -> OrgRoles.Director
    //   There is no OrgRoles.QAManager: inventing one would fork the role vocabulary and
    //   break every JWT already in circulation. Admin is added because Admin is already an
    //   unconditional actor everywhere else in the engine.
    //
    // WHY DENIAL CODES INSTEAD OF bool
    //   A bare false forces the API layer to invent a message, and three layers then
    //   disagree about why an action was refused. Every refusal below carries a stable,
    //   machine-readable code the frontend can switch on and localise.
    // =====================================================================================

    /// <summary>
    /// Permission strings for the Archive feature, following the existing
    /// "area.action" convention of <see cref="Permissions"/>.
    ///
    /// Declared here rather than inside <see cref="Permissions"/> so this feature adds no
    /// edit to a file every role in the system already depends on. They are honoured through
    /// the per-user AdditionalPermissions / RevokedPermissions CSV columns that
    /// RoleHierarchy.EffectivePermissions already merges, which is how a non-authority user
    /// can be granted archive rights without a code change.
    /// </summary>
    public static class ArchivePermissions
    {
        /// <summary>Revoke an approval and move the item to the Archive.</summary>
        public const string ArchiveRecord = "archive.archive";

        /// <summary>See the Archive sidebar section and its contents.</summary>
        public const string ViewArchive = "archive.view";

        /// <summary>Edit an item while it sits in the Archive.</summary>
        public const string EditArchived = "archive.edit";

        /// <summary>Restore an item to the main capability list and restart its workflow.</summary>
        public const string RestoreArchived = "archive.restore";

        /// <summary>Request a permanent purge. Does not perform one.</summary>
        public const string RequestPurge = "archive.request_purge";
    }

    /// <summary>Stable refusal codes returned by <see cref="ArchivePolicy"/>.</summary>
    public static class ArchiveDenialCodes
    {
        public const string NotAuthorizedRole = "ARCHIVE_NOT_AUTHORIZED_ROLE";
        public const string MissingPermission = "ARCHIVE_MISSING_PERMISSION";
        public const string ReasonRequired = "ARCHIVE_REASON_REQUIRED";
        public const string AlreadyArchived = "ARCHIVE_ALREADY_ARCHIVED";
        public const string NotArchived = "ARCHIVE_NOT_ARCHIVED";
        public const string EntryNotRestorable = "ARCHIVE_ENTRY_NOT_RESTORABLE";
        public const string ItemMismatch = "ARCHIVE_ITEM_MISMATCH";
        public const string ShopScopeViolation = "ARCHIVE_SHOP_SCOPE_VIOLATION";
    }

    /// <summary>
    /// Outcome of an archive-related authorization check. Immutable on purpose: a decision
    /// must not be "fixed up" by the caller after the fact.
    /// </summary>
    public sealed class ArchiveDecision
    {
        public bool Allowed { get; init; }

        /// <summary>Null when allowed; one of <see cref="ArchiveDenialCodes"/> otherwise.</summary>
        public string? DenialCode { get; init; }

        /// <summary>Human readable explanation, safe to surface in the UI.</summary>
        public string Message { get; init; } = string.Empty;

        public static ArchiveDecision Allow() =>
            new() { Allowed = true, Message = "Allowed." };

        public static ArchiveDecision Deny(string code, string message) =>
            new() { Allowed = false, DenialCode = code, Message = message };
    }

    /// <summary>
    /// Single source of truth for "who may archive / edit / restore, and what exactly
    /// happens to the record when they do".
    /// </summary>
    public static class ArchivePolicy
    {
        /// <summary>
        /// Roles that hold archive authority by default. Mirrors the requirement's
        /// "commonly by the QA Manager, ECAA, or Director roles", plus Admin.
        /// </summary>
        public static readonly string[] AuthorityRoles =
        {
            OrgRoles.Director,
            OrgRoles.QAPersonnel,
            OrgRoles.ECAAPersonnel,
            OrgRoles.Admin
        };

        private static readonly string[] RestoreRoles =
        {
            OrgRoles.TeamLeader,
            OrgRoles.Admin
        };

        /// <summary>
        /// Statuses that mean "this item is out of the active capability list".
        /// ApprovalStatus.Revoked is the status the archive stamps; Rejected and Expired are
        /// included because an expired or rejected item may also be archived rather than
        /// left to rot in the active list.
        /// </summary>
        public static bool IsArchivableStatus(ApprovalStatus status) =>
            status != ApprovalStatus.Revoked;

        /// <summary>True when the actor's role carries archive authority.</summary>
        public static bool HasAuthorityRole(string? role)
        {
            if (string.IsNullOrWhiteSpace(role))
            {
                return false;
            }

            return AuthorityRoles.Any(r =>
                string.Equals(r, role, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Effective check: an authority role OR an explicitly granted permission.
        /// The permission path is what lets an Admin widen access through the existing
        /// AdditionalPermissions CSV without a redeploy.
        /// </summary>
        private static bool IsPermitted(
            string? role,
            IReadOnlyCollection<string>? effectivePermissions,
            string permission)
        {
            if (string.Equals(role, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (effectivePermissions is not null
                && effectivePermissions.Any(p =>
                    string.Equals(p, permission, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            return HasAuthorityRole(role);
        }

        // ---------------------------------------------------------------------------------
        // DECISIONS
        // ---------------------------------------------------------------------------------

        /// <summary>
        /// May this actor archive (revoke / soft-delete) the record?
        /// </summary>
        /// <param name="actorRole">Canonical OrgRoles value of the caller.</param>
        /// <param name="effectivePermissions">
        /// Result of RoleHierarchy.EffectivePermissions(...) for the caller. May be null.
        /// </param>
        /// <param name="currentStatus">Status the record holds right now.</param>
        /// <param name="isCurrentlyActive">ATARecord.IsActive right now.</param>
        /// <param name="reason">Mandatory justification supplied by the caller.</param>
        public static ArchiveDecision CanArchive(
            string? actorRole,
            IReadOnlyCollection<string>? effectivePermissions,
            ApprovalStatus currentStatus,
            bool isCurrentlyActive,
            string? reason)
        {
            if (!IsPermitted(actorRole, effectivePermissions, ArchivePermissions.ArchiveRecord))
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotAuthorizedRole,
                    "Only the Director, QA Manager, ECAA or an Admin may revoke or delete a "
                    + "record. Ask one of them to perform the action, or have an Admin grant "
                    + "the 'archive.archive' permission.");
            }

            if (string.IsNullOrWhiteSpace(reason))
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.ReasonRequired,
                    "A written reason is mandatory: a revoked approval without a recorded "
                    + "justification is itself an audit finding.");
            }

            if (!isCurrentlyActive && currentStatus == ApprovalStatus.Revoked)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.AlreadyArchived,
                    "This item is already in the Archive.");
            }

            return ArchiveDecision.Allow();
        }

        /// <summary>
        /// May this actor EDIT an item that is currently archived?
        /// The requirement explicitly allows this, so the check is separate from restore:
        /// a user may be trusted to correct an archived record without being trusted to put
        /// it back into the active capability list.
        /// </summary>
        public static ArchiveDecision CanEditArchived(
            string? actorRole,
            IReadOnlyCollection<string>? effectivePermissions,
            ArchiveEntry entry)
        {
            if (entry is null)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotArchived,
                    "No archive entry was supplied, so the item is not archived.");
            }

            if (!entry.IsCurrentlyArchived)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotArchived,
                    "This item is not in the Archive; edit it through the normal form route.");
            }

            var canEdit = RestoreRoles.Contains(actorRole ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                || IsPermitted(actorRole, effectivePermissions, ArchivePermissions.EditArchived);
            if (!canEdit)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.MissingPermission,
                    "You may view this archived item but not edit it. The 'archive.edit' "
                    + "permission is required.");
            }

            return ArchiveDecision.Allow();
        }

        /// <summary>
        /// May this actor restore the item to the main capability list?
        /// </summary>
        public static ArchiveDecision CanRestore(
            string? actorRole,
            IReadOnlyCollection<string>? effectivePermissions,
            ArchiveEntry entry,
            Guid expectedItemId,
            string? reason)
        {
            if (entry is null)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotArchived,
                    "No archive entry was supplied, so there is nothing to restore.");
            }

            if (entry.ItemId != expectedItemId)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.ItemMismatch,
                    "The archive entry does not belong to the item being restored.");
            }

            if (!entry.IsRestorable)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.EntryNotRestorable,
                    "This archive entry has already been closed. Archive history is kept "
                    + "permanently, but only an entry still in the Archived state can be "
                    + "restored.");
            }

            var canRestore = RestoreRoles.Contains(actorRole ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                || IsPermitted(actorRole, effectivePermissions, ArchivePermissions.RestoreArchived);
            if (!canRestore)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotAuthorizedRole,
                    "Restoring an item restarts its approval workflow, so it is limited to "
                    + "the Director, QA Manager, ECAA, an Admin, or a user explicitly granted "
                    + "the 'archive.restore' permission.");
            }

            if (string.IsNullOrWhiteSpace(reason))
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.ReasonRequired,
                    "A restore reason is mandatory so the audit trail explains why a revoked "
                    + "capability was reinstated.");
            }

            return ArchiveDecision.Allow();
        }

        // ---------------------------------------------------------------------------------
        // MUTATIONS
        //
        // These two methods are the ONLY place the archive state of an ATA record changes.
        // They mutate the entity and RETURN the audit row; persisting both in one
        // transaction is the caller's job.
        // ---------------------------------------------------------------------------------

        /// <summary>
        /// Apply a soft delete / revocation to an ATA record and produce its archive entry.
        ///
        /// NOTE WHAT IS **NOT** DONE HERE: the row is never removed, and no historical
        /// signature is touched. ATARecordSignature rows stay exactly as they were, which is
        /// what lets a restored record show who had approved the superseded revision.
        /// </summary>
        public static ArchiveEntry ApplyArchive(
            ATARecord record,
            ArchiveTrigger trigger,
            long actorUserId,
            string actorName,
            string actorRole,
            string reason,
            DateTime utcNow,
            string shopName = "",
            string itemTitleOverride = "")
        {
            if (record is null)
            {
                throw new ArgumentNullException(nameof(record));
            }

            var statusBefore = record.ApprovalStatus;

            var entry = new ArchiveEntry
            {
                Id = Guid.NewGuid(),
                ItemKind = ArchivedItemKind.ATARecord,
                ItemId = record.Id,
                ATARecordId = record.Id,

                ItemTitle = string.IsNullOrWhiteSpace(itemTitleOverride)
                    ? record.Description
                    : itemTitleOverride,
                ItemReference = record.PartNumber,
                SectionCode = SidebarSections.Archive,
                FormType = "ata_record",
                ATAChapterCode = record.ATAChapterCode,
                ShopId = record.ShopId,
                ShopName = shopName,

                // Invariant A3: capture BEFORE overwriting.
                StatusBeforeArchive = statusBefore,
                StatusBeforeArchiveLabel = ApprovalStatusInfo.Label(statusBefore),
                RevisionNumberBeforeArchive = record.RevisionNumber,
                WasApprovedBeforeArchive = ApprovalStatusInfo.CountsAsComplete(statusBefore),

                Trigger = trigger,
                ArchivedByUserId = actorUserId,
                ArchivedByName = actorName ?? string.Empty,
                ArchivedByRole = actorRole ?? string.Empty,
                ArchivedAt = utcNow,
                Reason = reason ?? string.Empty,

                State = ArchiveEntryState.Archived,
                CreatedAt = utcNow,
                UpdatedAt = utcNow
            };

            // Invariant A2: soft delete only.
            record.IsActive = false;
            record.ApprovalStatus = ApprovalStatus.Revoked;
            record.UpdatedAt = utcNow;
            record.UpdatedBy = actorName ?? string.Empty;

            return entry;
        }

        /// <summary>
        /// Record an edit performed while the item sits in the Archive (invariant A5).
        /// </summary>
        public static void RecordEditWhileArchived(
            ArchiveEntry entry,
            long actorUserId,
            string actorName,
            DateTime utcNow)
        {
            if (entry is null)
            {
                throw new ArgumentNullException(nameof(entry));
            }

            entry.EditedWhileArchived = true;
            entry.EditsWhileArchived += 1;
            entry.LastEditedWhileArchivedAt = utcNow;
            entry.LastEditedWhileArchivedByUserId = actorUserId;
            entry.LastEditedWhileArchivedByName = actorName ?? string.Empty;
            entry.UpdatedAt = utcNow;
        }

        /// <summary>
        /// Restore the record to the main capability list and RESTART its approval workflow.
        ///
        /// Invariant A4 in code: the record goes back to Draft with a bumped revision
        /// number, and the stale approval fields are cleared. It does NOT return to
        /// StatusBeforeArchive - that would resurrect a revoked approval, which is the one
        /// outcome an aviation quality system must never allow.
        /// </summary>
        public static void ApplyRestore(
            ATARecord record,
            ArchiveEntry entry,
            long actorUserId,
            string actorName,
            string actorRole,
            string reason,
            DateTime utcNow)
        {
            if (record is null)
            {
                throw new ArgumentNullException(nameof(record));
            }

            if (entry is null)
            {
                throw new ArgumentNullException(nameof(entry));
            }

            // ----- the record returns to the active list, at the START of the chain -----
            record.IsActive = true;
            record.ApprovalStatus = ApprovalStatus.Draft;
            record.RevisionNumber = record.RevisionNumber + 1;

            // The previous approval is void: clear the pointer, keep the signature history.
            record.ApprovedByUserId = null;
            record.ApprovalDate = null;
            record.RejectionReason = string.Empty;

            record.UpdatedAt = utcNow;
            record.UpdatedBy = actorName ?? string.Empty;

            // ----- close the archive entry as history, never delete it -----
            entry.State = ArchiveEntryState.Restored;
            entry.RestoredByUserId = actorUserId;
            entry.RestoredByName = actorName ?? string.Empty;
            entry.RestoredByRole = actorRole ?? string.Empty;
            entry.RestoredAt = utcNow;
            entry.RestoreReason = reason ?? string.Empty;
            entry.StatusAfterRestore = ApprovalStatus.Draft;
            entry.RevisionNumberAfterRestore = record.RevisionNumber;
            entry.UpdatedAt = utcNow;
        }

        /// <summary>
        /// Flag a permanent-deletion request. Deliberately does not delete anything, so the
        /// requirement "data is never permanently lost" holds even for this path.
        /// </summary>
        public static ArchiveDecision RequestPurge(
            ArchiveEntry entry,
            string? actorRole,
            IReadOnlyCollection<string>? effectivePermissions,
            long actorUserId,
            string reason,
            DateTime utcNow)
        {
            if (entry is null)
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.NotArchived,
                    "No archive entry was supplied.");
            }

            if (!string.Equals(actorRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase)
                && !IsPermitted(actorRole, effectivePermissions, ArchivePermissions.RequestPurge))
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.MissingPermission,
                    "Requesting a permanent purge requires the 'archive.request_purge' "
                    + "permission.");
            }

            if (string.IsNullOrWhiteSpace(reason))
            {
                return ArchiveDecision.Deny(
                    ArchiveDenialCodes.ReasonRequired,
                    "A purge request must state its reason.");
            }

            entry.State = ArchiveEntryState.PurgeRequested;
            entry.PurgeRequestedByUserId = actorUserId;
            entry.PurgeRequestedAt = utcNow;
            entry.PurgeRequestReason = reason;
            entry.UpdatedAt = utcNow;

            return ArchiveDecision.Allow();
        }
    }
}