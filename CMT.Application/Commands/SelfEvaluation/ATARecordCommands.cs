using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    /// <summary>
    /// =====================================================================================
    /// AMENDED v24 — ROLE-BASED APPROVAL WORKFLOW + DELEGATE AUTHORITY
    /// File: CMT.Application.SelfEvaluation/Commands/SelfEvaluation/ATARecordCommands.cs
    ///
    /// WHAT v24 ADDS (and NOTHING ELSE — every pre-existing property is untouched, so all
    /// existing call sites and model binders keep working byte-for-byte):
    ///
    ///  1. ACTOR CONTEXT on every workflow command: `ActorRole` (canonical OrgRoles value
    ///     or any alias — the handler normalises it) and `ActorUserId`. The handler can no
    ///     longer be asked "who may do this?" without being told who is asking, which is
    ///     what allowed the old handler to advance a stage with no role check at all.
    ///
    ///  2. SCENARIO A — `ConfirmATARecordCommand`. When a Shop Team Leader creates (or
    ///     edits) the record, the record is ORIGINATOR-LED: there is no counter-signature
    ///     to collect, so the STL does not "approve" their own work through a review
    ///     chain. They CONFIRM it, with an OPTIONAL comment, and the record is finalized
    ///     immediately (ApprovalStatus.Approved). No Reject verb is offered on this path.
    ///
    ///  3. SCENARIO B — `ReturnATARecordForRevisionCommand`. An Engineer- or delegate-
    ///     created record routes to the Shop Team Leader, who has FULL authority: edit
    ///     directly, send back for revision (this command), or approve / reject with an
    ///     approval comment. Previously "send back" was faked client-side by rejecting
    ///     with a "RETURNED:" prefix, which permanently killed the record.
    ///
    ///  4. OPTIONAL APPROVAL COMMENT is first-class: `ApproveATARecordCommand.Comments`
    ///     and `ConfirmATARecordCommand.Comments` are optional by contract (empty string
    ///     is valid and is persisted as "no comment"), while
    ///     `RejectATARecordCommand.Reason` and `ReturnATARecordForRevisionCommand.Comments`
    ///     stay MANDATORY — a negative outcome must always be explained.
    ///
    ///  5. `CreateATARecordCommand.CreatedByUserId` / `CreatorRole` so the handler can
    ///     freeze WHO prepared the record and under WHICH role. That frozen role is what
    ///     decides Scenario A vs Scenario B for the rest of the record's life.
    /// =====================================================================================
    /// </summary>

    /// <summary>
    /// Shared actor context. Not a base class on purpose: these commands are bound
    /// directly from the request body by MVC, and a base class would change the binder's
    /// behaviour for the existing properties. Kept as a documented convention instead.
    /// </summary>
    public static class ATAWorkflowResponsibilities
    {
        /// <summary>Delegated permission to CREATE ATA records on a leader's behalf.</summary>
        public const string Creation = "ata_record_creation";

        /// <summary>Delegated permission to APPROVE / CONFIRM / REJECT / RETURN records.</summary>
        public const string Approval = "ata_record_approval";

        /// <summary>Delegated permission to exercise the full ATA workflow at the grantor's level.</summary>
        public const string Workflow = "ata_record_workflow";

        /// <summary>Every responsibility that grants workflow ACTION authority.</summary>
        public static readonly string[] ActionGranting = { Approval, Workflow, Creation };

        /// <summary>Every responsibility that grants READ access to the Table of Contents.</summary>
        public static readonly string[] ViewGranting = { Approval, Workflow, Creation };
    }

    /// <summary>
    /// Create a new ATA Record (parent in the hierarchy).
    ///
    /// AMENDED v2:
    /// - Added Authority (Shop Capability) field - supports multiple comma-separated values (ECAA, FAA, EASA).
    /// - Added ResponsibleWorkshop field - supports multiple comma-separated values (Galley, Electric).
    /// - ATAChapterId and ComponentId are Guid? (nullable) so the model binder accepts empty/null values.
    /// - ECAAShop and FAAShop kept for backward compatibility.
    ///
    /// AMENDED v24:
    /// - CreatedByUserId / CreatorRole are captured so the handler can freeze the preparer
    ///   identity and decide Scenario A (leader-prepared, confirm-only) vs Scenario B
    ///   (engineer/delegate-prepared, routes to the Shop Team Leader).
    /// </summary>
    public class CreateATARecordCommand : IRequest<Guid>
    {
        public string Description { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public DateTime? SelfEvaluationDate { get; set; }
        public string Manufacturer { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string CMMRevDate { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public string Aircraft { get; set; } = string.Empty;

        /// <summary>
        /// Shop Capability / Authority - comma-separated for multiple selections.
        /// Example: "ECAA,FAA" or "EASA"
        /// </summary>
        public string Authority { get; set; } = string.Empty;

        /// <summary>
        /// Responsible Workshop - comma-separated for multiple selections.
        /// Example: "Galley,Electric" or "Galley"
        /// </summary>
        public string ResponsibleWorkshop { get; set; } = string.Empty;

        // Legacy fields (backward compatibility)
        public string ECAAShop { get; set; } = string.Empty;
        public string FAAShop { get; set; } = string.Empty;

        public string LetterRefNo { get; set; } = string.Empty;
        public Guid ShopId { get; set; }

        // AMENDED: Changed from Guid to Guid? to accept null/empty from frontend
        public Guid? ATAChapterId { get; set; }

        // AMENDED: Changed from Guid to Guid? to accept null/empty from frontend
        public Guid? ComponentId { get; set; }

        public string CreatedBy { get; set; } = string.Empty;

        // ===== v24 ACTOR CONTEXT (stamped by the controller, never trusted from the client) =====

        /// <summary>Authenticated user id of the preparer. User.Id is long, never Guid.</summary>
        public long? CreatedByUserId { get; set; }

        /// <summary>
        /// Role of the preparer AT CREATION TIME. Any alias is accepted; the handler
        /// normalises it through RoleHierarchy. This frozen value decides whether the
        /// record follows Scenario A (leader-prepared) or Scenario B (routes to the STL).
        /// </summary>
        public string ActorRole { get; set; } = string.Empty;
    }

    /// <summary>
    /// Update an existing ATA Record.
    /// AMENDED v3: Added Authority, ResponsibleWorkshop, and CMMPdfUrl fields.
    /// AMENDED v24: ActorRole / ActorUserId so the handler can allow the Shop Team Leader
    /// to EDIT a submitted record directly (Scenario B: "Edit the record directly"),
    /// which the old Draft/Returned-only guard silently refused.
    /// </summary>
    public class UpdateATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string Description { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public DateTime? SelfEvaluationDate { get; set; }
        public string Manufacturer { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string CMMRevDate { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public string CMMPdfUrl { get; set; } = string.Empty;
        public string Aircraft { get; set; } = string.Empty;

        /// <summary>
        /// Shop Capability / Authority - comma-separated for multiple selections.
        /// </summary>
        public string Authority { get; set; } = string.Empty;

        /// <summary>
        /// Responsible Workshop - comma-separated for multiple selections.
        /// </summary>
        public string ResponsibleWorkshop { get; set; } = string.Empty;

        // Legacy fields (backward compatibility)
        public string ECAAShop { get; set; } = string.Empty;
        public string FAAShop { get; set; } = string.Empty;

        public string LetterRefNo { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;

        // ===== v24 ACTOR CONTEXT =====
        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Starts a new revision of a completed ATA record. Only the Shop Team Leader
    /// authority may invoke this action; the handler resets the record and every
    /// related Table of Contents workflow back to Draft.
    /// </summary>
    public class StartATARecordRevisionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string StartedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Delete (soft-delete) an ATA Record.
    /// </summary>
    public class DeleteATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }

    /// <summary>
    /// Submit an ATA Record for approval (moves from Draft to PendingTeamLeaderReview).
    /// AMENDED v24: ActorRole / ActorUserId. A leader-prepared record does NOT need a
    /// submit-then-approve round trip — the handler answers with the confirm path instead.
    /// </summary>
    public class SubmitATARecordForApprovalCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string SubmittedBy { get; set; } = string.Empty;
        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Approve an ATA Record at the current approval level.
    /// AMENDED v24: `Comments` is the OPTIONAL approval comment surfaced on the approve
    /// button. Empty is valid and is persisted as "no comment". ActorRole / ActorUserId
    /// are mandatory for the stage-ownership and delegation checks.
    /// </summary>
    public class ApproveATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ApprovedBy { get; set; } = string.Empty;

        /// <summary>OPTIONAL approval comment. Empty string is a valid approval.</summary>
        public string Comments { get; set; } = string.Empty;

        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// SCENARIO A — the Shop Team Leader CONFIRMS a record they prepared themselves.
    /// There is no counter-signature to collect, so confirmation finalizes the record
    /// immediately (ApprovalStatus.Approved). The comment is OPTIONAL, and no Reject
    /// verb exists on this path: an STL who is unhappy with their own record amends it.
    /// </summary>
    public class ConfirmATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ConfirmedBy { get; set; } = string.Empty;

        /// <summary>OPTIONAL confirmation comment.</summary>
        public string Comments { get; set; } = string.Empty;

        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// SCENARIO B — send the record BACK FOR REVISION. Distinct from Reject: the record
    /// returns to the preparer (ApprovalStatus.Returned or the previous signable stage)
    /// and stays alive, whereas Reject is terminal. Comments are MANDATORY.
    /// </summary>
    public class ReturnATARecordForRevisionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ReturnedBy { get; set; } = string.Empty;

        /// <summary>MANDATORY: what must be corrected.</summary>
        public string Comments { get; set; } = string.Empty;

        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Reject an ATA Record. Terminal outcome; the reason is MANDATORY.
    /// AMENDED v24: ActorRole / ActorUserId for the stage-ownership + delegation check.
    /// </summary>
    public class RejectATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string RejectedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Reassign / delegate an ATA Record to another user.
    /// AMENDED v24: `Responsibility` records WHICH authority level travels with the
    /// delegation, so the delegatee is granted workflow actions matching their delegated
    /// role level instead of a bare assignment with no permissions attached.
    /// </summary>
    public class ReassignATARecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }

        /// <summary>PHASE 0 retype: User.Id is long, never Guid.</summary>
        public long AssignToUserId { get; set; }
        public string ReassignedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;

        /// <summary>
        /// Display name of the delegatee. Persisted on the delegation row so the
        /// authority check can resolve the grant by name (ResponsibilityDelegation
        /// stores names, not ids).
        /// </summary>
        public string AssignToUserName { get; set; } = string.Empty;

        /// <summary>
        /// Which responsibility travels with the delegation. Defaults to the full
        /// workflow level so a delegate can act, not merely receive the record.
        /// </summary>
        public string Responsibility { get; set; } = ATAWorkflowResponsibilities.Workflow;

        /// <summary>Optional expiry of the delegated authority.</summary>
        public DateTime? ExpirationDate { get; set; }

        public string ActorRole { get; set; } = string.Empty;
        public long? ActorUserId { get; set; }
    }

    /// <summary>
    /// Store CMM revision data fetched from the external system.
    /// This does NOT require the record to be in Draft/Returned status
    /// because CMM data is reference/technical data that should always be updatable.
    /// Once stored, the data for that specific part number is persisted and
    /// will not be removed unless the source data is updated (user clicks refresh).
    /// </summary>
    public class StoreCMMDataCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string RevNo { get; set; } = string.Empty;
        public string CMMRevDate { get; set; } = string.Empty;
        public string CMMPdfUrl { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }
}