using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.Models.Workflow;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    /// <summary>
    /// =====================================================================================
    /// ATARecordCommandHandler - AMENDED v24 (ROLE-BASED APPROVAL WORKFLOW + DELEGATES)
    ///
    /// PRE-EXISTING BEHAVIOUR PRESERVED (v5): nullable ATAChapterId/ComponentId handling,
    /// Authority / ResponsibleWorkshop mapping, StoreCMMDataCommand, CMMPdfUrl mapping.
    ///
    /// WHAT v24 CHANGES — the approval workflow is now SIMPLIFIED AND ROLE-BASED:
    ///
    /// SCENARIO A — the Shop Team Leader prepares the record.
    ///   The frozen CreatorRole is a leader-tier role, so the record is ORIGINATOR-LED.
    ///   There is no counter-signature to collect, therefore:
    ///     • CONFIRM (ConfirmATARecordCommand) finalizes the record IMMEDIATELY
    ///       (ApprovalStatus.Approved), with an OPTIONAL comment.
    ///     • APPROVE on an originator-led record is treated as the same confirmation,
    ///       so the existing Approve button keeps working and also finalizes at once.
    ///     • REJECT is refused on this path — an STL unhappy with their own record
    ///       AMENDS it (Update stays open while the record is not finalized).
    ///
    /// SCENARIO B — an Engineer or a DELEGATE prepares the record.
    ///   The record routes to the Shop Team Leader, who holds full authority:
    ///     • edit the record directly, even after submission (Update),
    ///     • send it back for revision (ReturnATARecordForRevisionCommand) — the record
    ///       stays alive, unlike the old "RETURNED:" reject hack,
    ///     • approve with an OPTIONAL approval comment, or reject with a MANDATORY reason.
    ///   The STL's acceptance is the LAST signable step: the record becomes Approved
    ///   (unless the record explicitly opted into QA / Director / ECAA stages, which the
    ///   catalog still honours).
    ///
    /// DELEGATES.
    ///   A live ResponsibilityDelegation now grants REAL workflow authority at the
    ///   delegated level: approve, confirm, reject, return and reassign. Authority is
    ///   resolved SERVER-SIDE from the delegation table (never from a client flag), and
    ///   every action taken under a delegation is stamped in the audit trail as such, so
    ///   accountability always names the real acting person.
    /// =====================================================================================
    /// </summary>
    public class ATARecordCommandHandler :
        IRequestHandler<CreateATARecordCommand, Guid>,
        IRequestHandler<UpdateATARecordCommand, bool>,
        IRequestHandler<StartATARecordRevisionCommand, bool>,
        IRequestHandler<DeleteATARecordCommand, bool>,
        IRequestHandler<SubmitATARecordForApprovalCommand, bool>,
        IRequestHandler<ApproveATARecordCommand, bool>,
        IRequestHandler<ConfirmATARecordCommand, bool>,
        IRequestHandler<ReturnATARecordForRevisionCommand, bool>,
        IRequestHandler<RejectATARecordCommand, bool>,
        IRequestHandler<ReassignATARecordCommand, bool>,
        IRequestHandler<StoreCMMDataCommand, bool>
    {
        private readonly ApplicationDbContext _context;
        private readonly IUserSignatureService _signatures;

        public ATARecordCommandHandler(
            ApplicationDbContext context,
            IUserSignatureService signatures)
        {
            _context = context;
            _signatures = signatures;
        }

        // =================================================================================
        // ROLE / DELEGATION HELPERS
        // =================================================================================

        /// <summary>Marker appended to CreatorRole when the preparer acted under a delegation.</summary>
        private const string DelegatedRoleMarker = ":delegated";

        /// <summary>
        /// Roles that own the Shop Team Leader confirmation authority. A record prepared
        /// by one of these is ORIGINATOR-LED (Scenario A). Admin is the universal
        /// supervisor, consistent with RoleHierarchy.CanActOn.
        /// </summary>
        private static readonly string[] LeaderTierRoles =
        {
            OrgRoles.TeamLeader,
            OrgRoles.ShopManager,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.Admin
        };

        private static string Canonical(string? role)
            => RoleHierarchy.Normalize(role) ?? string.Empty;

        private static bool IsLeaderTier(string? role)
        {
            var canonical = Canonical(role);
            return canonical.Length > 0
                && LeaderTierRoles.Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// True when the record was prepared by a leader-tier role acting in their OWN
        /// capacity. A record prepared under a delegation is deliberately NOT
        /// originator-led: per Scenario B it must route to the Shop Team Leader.
        /// </summary>
        private static bool IsOriginatorLed(ATARecord record)
        {
            var creatorRole = record.CreatorRole ?? string.Empty;
            if (creatorRole.EndsWith(DelegatedRoleMarker, StringComparison.OrdinalIgnoreCase))
                return false;
            return IsLeaderTier(creatorRole);
        }

        private static bool IsFinalized(ATARecord record)
            => record.ApprovalStatus == ApprovalStatus.Approved
            || record.ApprovalStatus == ApprovalStatus.Rejected;

        /// <summary>
        /// Resolves a LIVE delegation held by the acting user for any of the supplied
        /// responsibilities. Status alone is not sufficient: a row can remain persisted as
        /// Active after its expiration date has passed, so the window is re-checked here.
        /// Date filtering runs in memory to stay provider-agnostic.
        /// </summary>
        private async Task<ResponsibilityDelegation?> FindLiveDelegationAsync(
            string? actorName,
            IReadOnlyCollection<string> responsibilities,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(actorName)) return null;

            var candidates = await _context.ResponsibilityDelegations
                .Where(d => d.Status == DelegationStatus.Active && d.DelegatedTo == actorName)
                .ToListAsync(cancellationToken);

            var now = DateTime.UtcNow;

            return candidates.FirstOrDefault(d =>
                responsibilities.Contains(d.Responsibility, StringComparer.OrdinalIgnoreCase)
                && d.EffectiveDate <= now
                // An expiration DATE is inclusive: the grant stays valid through that day.
                && (d.ExpirationDate == null || d.ExpirationDate.Value.Date >= now.Date));
        }

        /// <summary>
        /// Decides whether the caller may execute the record's CURRENT stage.
        /// Order of evaluation:
        ///   1. The caller's OWN role owns the stage (ATARecordWorkflowCatalog).
        ///   2. The caller holds a live delegation granting workflow authority.
        /// Returns the delegation when authority came from one, so the audit trail can
        /// disclose that the action was taken under a delegated mandate.
        /// </summary>
        private async Task<(bool allowed, ResponsibilityDelegation? delegation)> ResolveStageAuthorityAsync(
            ATARecord record,
            string? actorRole,
            string? actorName,
            CancellationToken cancellationToken)
        {
            if (ATARecordWorkflowCatalog.IsCurrentStageRole(record, actorRole))
                return (true, null);

            var delegation = await FindLiveDelegationAsync(
                actorName, ATAWorkflowResponsibilities.ActionGranting, cancellationToken);

            return (delegation != null, delegation);
        }

        /// <summary>
        /// Authority to CONFIRM / FINALIZE an originator-led record: the preparer
        /// themselves, any leader-tier role, or a live delegate.
        /// </summary>
        private async Task<(bool allowed, ResponsibilityDelegation? delegation)> ResolveConfirmAuthorityAsync(
            ATARecord record,
            string? actorRole,
            string? actorName,
            long? actorUserId,
            CancellationToken cancellationToken)
        {
            if (IsLeaderTier(actorRole)) return (true, null);

            var isPreparer =
                (actorUserId.HasValue && record.CreatedByUserId == actorUserId.Value)
                || (!string.IsNullOrWhiteSpace(actorName)
                    && string.Equals(record.CreatedBy, actorName, StringComparison.OrdinalIgnoreCase));

            if (isPreparer && IsOriginatorLed(record)) return (true, null);

            var delegation = await FindLiveDelegationAsync(
                actorName, ATAWorkflowResponsibilities.ActionGranting, cancellationToken);

            return (delegation != null, delegation);
        }

        private static string WithDelegationNote(string? details, ResponsibilityDelegation? delegation)
        {
            var body = string.IsNullOrWhiteSpace(details) ? "No comment provided" : details!.Trim();
            if (delegation == null) return body;
            return $"{body} [acted under delegation from {delegation.DelegatedBy}]";
        }

        private void AddAudit(
            Guid recordId,
            string action,
            WorkflowAction workflowAction,
            string performedBy,
            string userRole,
            string details,
            string previousValues = "",
            string newValues = "")
        {
            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = action,
                WorkflowAction = workflowAction,
                EntityType = "ATARecord",
                EntityId = recordId,
                PerformedBy = performedBy,
                UserRole = userRole,
                Details = details,
                PreviousValues = previousValues,
                NewValues = newValues,
                Timestamp = DateTime.UtcNow
            });
        }

        private void AddAudit(
            Guid recordId,
            string action,
            WorkflowAction workflowAction,
            string performedBy,
            string details)
        {
            AddAudit(recordId, action, workflowAction, performedBy, "", details);
        }

        /// <summary>
        /// Finalizes the record. Shared by the Scenario A confirmation path and by the
        /// Scenario B Shop Team Leader acceptance when no optional stage remains.
        /// </summary>
        private void Finalize(ATARecord record, string actorName, long? actorUserId)
        {
            record.ApprovalStatus = ApprovalStatus.Approved;
            record.ApprovalDate = DateTime.UtcNow;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = actorName;

            // ApprovedByUserId is long? (User.Id is long, never Guid).
            record.ApprovedByUserId = actorUserId
                ?? (long.TryParse(actorName, out var parsed) ? parsed : null);
        }

        private async Task StampSignatureAsync(
            ATARecord record,
            string caption,
            SignatureBlockType block,
            ApprovalStatus stageStatus,
            ApprovalStatus resultingStatus,
            string actorName,
            string actorRole,
            long? actorUserId,
            WorkflowStepAction action,
            string comments,
            CancellationToken cancellationToken)
        {
            var signedAt = DateTime.UtcNow;
            var canonicalRole = Canonical(actorRole);
            var specimen = actorUserId.HasValue
                ? await _signatures.GetActiveAsync(actorUserId.Value, cancellationToken)
                : null;

            var current = await _context.ATARecordSignatures
                .Where(s => s.ATARecordId == record.Id && s.Block == block && s.IsCurrent)
                .ToListAsync(cancellationToken);

            foreach (var line in current)
            {
                line.IsCurrent = false;
                line.SupersededAt = signedAt;
                line.SupersededReason = $"Replaced by {caption} in {record.RevisionLabel}";
            }

            var signature = new ATARecordSignature
            {
                Id = Guid.NewGuid(),
                ATARecordId = record.Id,
                StageOrder = ATARecordWorkflowCatalog.CurrentStage(record)?.Order ?? 0,
                StageStatus = stageStatus,
                ResultingStatus = resultingStatus,
                Block = block,
                BlockCaption = caption,
                UserId = actorUserId,
                PersonName = actorName,
                PersonRole = canonicalRole,
                PersonRoleLabel = RoleHierarchy.Label(canonicalRole),
                SignedAt = signedAt,
                UserSignatureId = specimen?.Id,
                SignatureStoragePath = specimen?.StoragePath,
                SignatureFileName = specimen?.FileName,
                SignatureContentType = specimen?.ContentType,
                SignatureFileSha256 = specimen?.FileSha256,
                SignatureImageApplied = specimen?.IsUsableForStamping == true,
                SignatureHash = ATARecordWatermark.BuildHash(
                    record.Id, ATARecordWorkflowCatalog.CurrentStage(record)?.Order ?? 0,
                    actorUserId, signedAt, specimen?.FileSha256),
                ActionTaken = action,
                Comments = comments ?? string.Empty,
                IsCurrent = true,
                RecordRevisionNumber = record.RevisionNumber,
                CreatedAt = signedAt
            };

            _context.ATARecordSignatures.Add(signature);
        }

        private async Task AddAmendmentAsync(
            ATARecord record,
            string fieldName,
            string fieldLabel,
            string? oldValue,
            string? newValue,
            string actorName,
            string actorRole,
            long? actorUserId,
            string reason,
            CancellationToken cancellationToken)
        {
            if (!actorUserId.HasValue) return;

            var sequence = await _context.ATARecordAmendments
                .Where(a => a.ATARecordId == record.Id)
                .Select(a => (int?)a.Sequence)
                .MaxAsync(cancellationToken) ?? 0;

            var pendingAmendments = _context.ChangeTracker
                .Entries<ATARecordAmendment>()
                .Count(e => e.State == EntityState.Added && e.Entity.ATARecordId == record.Id);
            sequence += pendingAmendments;

            _context.ATARecordAmendments.Add(new ATARecordAmendment
            {
                Id = Guid.NewGuid(),
                ATARecordId = record.Id,
                Sequence = sequence + 1,
                RecordRevisionNumber = record.RevisionNumber,
                FieldName = fieldName,
                FieldLabel = fieldLabel,
                OldValue = oldValue,
                NewValue = newValue,
                AmendedByUserId = actorUserId.Value,
                AmendedByName = actorName,
                AmendedByRole = Canonical(actorRole),
                AmendedAt = DateTime.UtcNow,
                StatusAtAmendment = record.ApprovalStatus,
                IsPostApproval = record.ApprovalStatus == ApprovalStatus.Approved,
                Reason = reason ?? string.Empty
            });
        }

        // =================================================================================
        // CREATE
        // =================================================================================

        public async Task<Guid> Handle(CreateATARecordCommand request, CancellationToken cancellationToken)
        {
            // Properly handle nullable Guid? from the command
            Guid? effectiveATAChapterId = (request.ATAChapterId.HasValue && request.ATAChapterId.Value != Guid.Empty)
                ? request.ATAChapterId.Value
                : null;

            Guid? effectiveComponentId = (request.ComponentId.HasValue && request.ComponentId.Value != Guid.Empty)
                ? request.ComponentId.Value
                : null;

            // v24: freeze the preparer's role. A non-leader who holds a live delegation is
            // stamped with the ":delegated" marker so the record still routes to the Shop
            // Team Leader (Scenario B) instead of being finalizable by its own preparer.
            var canonicalRole = Canonical(request.ActorRole);
            var creatorRole = canonicalRole;

            var isAllowedDirectCreator = string.Equals(canonicalRole, OrgRoles.TeamLeader, StringComparison.OrdinalIgnoreCase)
                || string.Equals(canonicalRole, OrgRoles.Engineer, StringComparison.OrdinalIgnoreCase);
            ResponsibilityDelegation? creationDelegation = null;
            if (!isAllowedDirectCreator)
            {
                creationDelegation = await FindLiveDelegationAsync(
                    request.CreatedBy, new[] { ATAWorkflowResponsibilities.Creation, ATAWorkflowResponsibilities.Workflow }, cancellationToken);
                if (creationDelegation is null)
                    throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.NotInApproverRole,
                        "Only a Shop Team Leader or Engineer may create an ATA record, unless a live workload delegation is active.");
            }

            if (!IsLeaderTier(canonicalRole))
            {
                if (creationDelegation != null)
                {
                    creatorRole = string.IsNullOrEmpty(canonicalRole)
                        ? OrgRoles.Engineer + DelegatedRoleMarker
                        : canonicalRole + DelegatedRoleMarker;
                }
            }

            if (creatorRole.Length > 50) creatorRole = creatorRole.Substring(0, 50);

            var record = new ATARecord
            {
                Id = Guid.NewGuid(),
                Description = request.Description,
                PartNumber = request.PartNumber,
                SelfEvaluationDate = request.SelfEvaluationDate ?? DateTime.UtcNow,
                Manufacturer = request.Manufacturer,
                ATAChapterCode = request.ATAChapterCode ?? string.Empty,
                CMMRevDate = request.CMMRevDate,
                RevNo = request.RevNo,
                CMMPdfUrl = string.Empty,
                Aircraft = request.Aircraft,
                Authority = request.Authority ?? string.Empty,
                ResponsibleWorkshop = request.ResponsibleWorkshop ?? string.Empty,
                // Legacy fields (backward compatibility)
                ECAAShop = request.ECAAShop ?? string.Empty,
                FAAShop = request.FAAShop ?? string.Empty,
                LetterRefNo = request.LetterRefNo,
                ShopId = request.ShopId,
                ATAChapterId = effectiveATAChapterId,
                ComponentId = effectiveComponentId,
                ApprovalStatus = ApprovalStatus.Draft,
                RevisionNumber = 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy,
                CreatedByUserId = request.CreatedByUserId,
                CreatorRole = creatorRole
            };

            _context.ATARecords.Add(record);
            await StampSignatureAsync(
                record,
                ATARecordWatermark.CreatedByCaption,
                SignatureBlockType.PreparedBy,
                ApprovalStatus.Draft,
                ApprovalStatus.Draft,
                request.CreatedBy,
                creatorRole,
                request.CreatedByUserId,
                WorkflowStepAction.Created,
                "Record created",
                cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);

            var routing = IsOriginatorLed(record)
                ? "Prepared by the Shop Team Leader — confirmation finalizes the record"
                : "Prepared for Shop Team Leader review";

            AddAudit(
                record.Id,
                "ATA Record Created",
                WorkflowAction.Created,
                request.CreatedBy,
                $"Created ATA Record: {request.PartNumber} - {request.Description}. {routing}.");

            await _context.SaveChangesAsync(cancellationToken);

            return record.Id;
        }

        // =================================================================================
        // UPDATE
        // =================================================================================

        public async Task<bool> Handle(UpdateATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;

            // A finalized record is immutable.
            if (IsFinalized(record)) return false;

            // v24 SCENARIO B: the Shop Team Leader may "edit the record directly" even
            // while it sits in a review stage. The old Draft/Returned-only guard blocked
            // exactly the authority the requirement grants. Preparers (and delegates
            // acting for them) remain limited to the pre-submission window.
            var withOriginator =
                record.ApprovalStatus == ApprovalStatus.Draft
                || record.ApprovalStatus == ApprovalStatus.Returned;

            if (withOriginator)
            {
                var isCreator = request.ActorUserId.HasValue
                    && record.CreatedByUserId == request.ActorUserId.Value;
                var mayManageDraft = string.Equals(Canonical(request.ActorRole), OrgRoles.TeamLeader, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(Canonical(request.ActorRole), OrgRoles.Engineer, StringComparison.OrdinalIgnoreCase);
                var delegated = await FindLiveDelegationAsync(
                    request.UpdatedBy, new[] { ATAWorkflowResponsibilities.Creation, ATAWorkflowResponsibilities.Workflow }, cancellationToken);

                if (!isCreator && !mayManageDraft && delegated is null) return false;
            }
            else
            {
                var (allowed, _) = await ResolveStageAuthorityAsync(
                    record, request.ActorRole, request.UpdatedBy, cancellationToken);

                if (!allowed) return false;
            }

            var oldDescription = record.Description;
            var oldPartNumber = record.PartNumber;
            var oldManufacturer = record.Manufacturer;
            var oldAuthority = record.Authority;
            var oldWorkshop = record.ResponsibleWorkshop;
            var oldRevNo = record.RevNo;
            var oldCmmRevDate = record.CMMRevDate;
            var oldCmmPdfUrl = record.CMMPdfUrl;

            record.Description = request.Description;
            record.PartNumber = request.PartNumber;
            record.SelfEvaluationDate = request.SelfEvaluationDate;
            record.Manufacturer = request.Manufacturer;
            record.ATAChapterCode = request.ATAChapterCode;
            record.CMMRevDate = request.CMMRevDate;
            record.RevNo = request.RevNo;
            record.CMMPdfUrl = request.CMMPdfUrl ?? string.Empty;
            record.Aircraft = request.Aircraft;
            record.Authority = request.Authority ?? string.Empty;
            record.ResponsibleWorkshop = request.ResponsibleWorkshop ?? string.Empty;
            // Legacy fields (backward compatibility)
            record.ECAAShop = request.ECAAShop ?? string.Empty;
            record.FAAShop = request.FAAShop ?? string.Empty;
            record.LetterRefNo = request.LetterRefNo;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.UpdatedBy;

            // If returned, reset to draft
            if (record.ApprovalStatus == ApprovalStatus.Returned)
            {
                record.ApprovalStatus = ApprovalStatus.Draft;
                record.RevisionNumber++;
            }

            await AddAmendmentIfChangedAsync(record, "Description", "Description", oldDescription, record.Description, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "PartNumber", "P/N", oldPartNumber, record.PartNumber, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "Manufacturer", "Manufacturer", oldManufacturer, record.Manufacturer, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "Authority", "Authority", oldAuthority, record.Authority, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "ResponsibleWorkshop", "Responsible Workshop", oldWorkshop, record.ResponsibleWorkshop, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "RevNo", "Revision", oldRevNo, record.RevNo, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "CMMRevDate", "CMM Rev Date", oldCmmRevDate, record.CMMRevDate, request, cancellationToken);
            await AddAmendmentIfChangedAsync(record, "CMMPdfUrl", "CMM PDF", oldCmmPdfUrl, record.CMMPdfUrl, request, cancellationToken);

            await StampSignatureAsync(
                record,
                ATARecordWatermark.EditedByCaption,
                SignatureBlockType.PreparedBy,
                record.ApprovalStatus,
                record.ApprovalStatus,
                request.UpdatedBy,
                request.ActorRole,
                request.ActorUserId,
                WorkflowStepAction.Amended,
                "ATA record amended",
                cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);

            AddAudit(
                record.Id,
                "ATA Record Updated",
                WorkflowAction.Updated,
                request.UpdatedBy,
                $"Updated ATA Record: {request.PartNumber}");

            await _context.SaveChangesAsync(cancellationToken);

            return true;
        }

        private Task AddAmendmentIfChangedAsync(
            ATARecord record,
            string fieldName,
            string fieldLabel,
            string? oldValue,
            string? newValue,
            UpdateATARecordCommand request,
            CancellationToken cancellationToken)
        {
            return string.Equals(oldValue, newValue, StringComparison.Ordinal)
                ? Task.CompletedTask
                : AddAmendmentAsync(
                    record,
                    fieldName,
                    fieldLabel,
                    oldValue,
                    newValue,
                    request.UpdatedBy,
                    request.ActorRole,
                    request.ActorUserId,
                    "Record edited",
                    cancellationToken);
        }

        public async Task<bool> Handle(StartATARecordRevisionCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive || record.ApprovalStatus != ApprovalStatus.Approved)
                return false;

            var canonicalRole = Canonical(request.ActorRole);
            if (!string.Equals(canonicalRole, OrgRoles.TeamLeader, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(canonicalRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
                return false;

            var oldRevision = record.RevisionLabel;
            record.RevisionNumber = Math.Max(1, record.RevisionNumber) + 1;
            record.ApprovalStatus = ApprovalStatus.Draft;
            record.ApprovalDate = null;
            record.ApprovedByUserId = null;
            record.RejectionReason = string.Empty;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.StartedBy;

            var signatureHistory = await _context.ATARecordSignatures
                .Where(s => s.ATARecordId == record.Id && s.IsCurrent)
                .ToListAsync(cancellationToken);
            foreach (var signature in signatureHistory)
            {
                signature.IsCurrent = false;
                signature.SupersededAt = record.UpdatedAt;
                signature.SupersededReason = $"{record.RevisionLabel} started by {request.StartedBy}";
            }

            var folder = await _context.EvaluationFolders
                .Include(f => f.Items)
                .FirstOrDefaultAsync(f => f.ATARecordId == record.Id, cancellationToken);

            if (folder != null)
            {
                folder.RevisionNumber = Math.Max(1, folder.RevisionNumber) + 1;
                folder.Status = ApprovalStatus.Draft;
                folder.IsComplete = false;
                folder.IsLocked = false;
                folder.CompletedAt = null;
                folder.CompletedByUserId = null;
                folder.LockedAt = null;
                folder.LockedByUserId = null;
                folder.UpdatedAt = record.UpdatedAt;
                folder.UpdatedBy = request.StartedBy;

                foreach (var item in folder.Items)
                {
                    item.Status = ApprovalStatus.Draft;
                    item.LifecycleState = FormLifecycleState.Draft;
                    item.StatusLabel = ApprovalStatusInfo.Label(ApprovalStatus.Draft);
                    item.CompletedSteps = 0;
                    item.CurrentStepTitle = string.Empty;
                    item.CurrentAssigneeUserId = null;
                    item.CurrentAssigneeName = string.Empty;
                    item.IsExpired = false;
                    item.ExpiresAt = null;
                    item.UpdatedAt = record.UpdatedAt;
                }
            }

            var formSubmissions = await _context.FormSubmissions
                .Where(f => f.ATARecordId == record.Id)
                .ToListAsync(cancellationToken);
            foreach (var form in formSubmissions)
            {
                form.ApprovalStatus = ApprovalStatus.Draft;
                form.SubmittedByUserId = null;
                form.SubmittedDate = null;
                form.ReviewedByUserId = null;
                form.ReviewedDate = null;
                form.ApprovedByUserId = null;
                form.ApprovedDate = null;
                form.CurrentApproverUserId = null;
                form.RejectionReason = string.Empty;
                form.ReviewComments = string.Empty;
                form.RevisionNumber = Math.Max(1, form.RevisionNumber) + 1;
                form.ApprovalSignatureHash = string.Empty;
            }

            var instances = await _context.WorkflowInstances
                .Where(i => i.ATARecordId == record.Id)
                .Include(i => i.Steps)
                .ToListAsync(cancellationToken);
            foreach (var instance in instances)
            {
                instance.Status = ApprovalStatus.Draft;
                instance.CurrentStepNo = 0;
                instance.CurrentAssigneeUserId = null;
                instance.SubmittedAt = null;
                instance.CompletedAt = null;
                instance.IsComplete = false;
                instance.IsLocked = false;
                instance.RevisionNumber = Math.Max(1, instance.RevisionNumber) + 1;
                instance.UpdatedAt = record.UpdatedAt;
                instance.UpdatedBy = request.StartedBy;

                foreach (var step in instance.Steps)
                {
                    step.State = WorkflowStepState.NotStarted;
                    step.ActionTaken = WorkflowStepAction.None;
                    step.AssignedToUserId = null;
                    step.AssignedToName = string.Empty;
                    step.AssignedToRole = string.Empty;
                    step.AssignedByUserId = null;
                    step.AssignedAt = null;
                    step.ActedByUserId = null;
                    step.ActedByName = string.Empty;
                    step.ActedByRole = string.Empty;
                    step.ActedAt = null;
                    step.Comments = string.Empty;
                    step.SignatureName = string.Empty;
                    step.SignatureRole = string.Empty;
                    step.SignatureDate = null;
                    step.SignatureHash = string.Empty;
                    step.UserSignatureId = null;
                    step.SignatureStoragePath = null;
                    step.SignatureImageApplied = false;
                    step.UpdatedAt = record.UpdatedAt;
                }
            }

            await AddAmendmentAsync(
                record,
                ATARecordWatermark.RevisionFieldName,
                ATARecordWatermark.RevisionFieldLabel,
                oldRevision,
                record.RevisionLabel,
                request.StartedBy,
                request.ActorRole,
                request.ActorUserId,
                string.IsNullOrWhiteSpace(request.Reason) ? "New revision started" : request.Reason,
                cancellationToken);

            await StampSignatureAsync(
                record,
                ATARecordWatermark.CreatedByCaption,
                SignatureBlockType.PreparedBy,
                ApprovalStatus.Draft,
                ApprovalStatus.Draft,
                request.StartedBy,
                request.ActorRole,
                request.ActorUserId,
                WorkflowStepAction.Reopened,
                string.IsNullOrWhiteSpace(request.Reason) ? "Revision started" : request.Reason,
                cancellationToken);

            AddAudit(
                record.Id,
                $"ATA Record Revision Started ({record.RevisionLabel})",
                WorkflowAction.Updated,
                request.StartedBy,
                string.IsNullOrWhiteSpace(request.Reason) ? "Approval workflow reset" : request.Reason);

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DeleteATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null) return false;

            record.IsActive = false;
            record.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // SUBMIT
        // =================================================================================

        public async Task<bool> Handle(SubmitATARecordForApprovalCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;

            if (record.ApprovalStatus != ApprovalStatus.Draft && record.ApprovalStatus != ApprovalStatus.Returned)
                return false;

            // The record must enter the review queue before any approver or delegate takes a
            // formal action. Submitting must not short-circuit to approval; it must reveal the
            // approval actions so the user can Approve, Reject, Delegate or Request Revision.
            record.ApprovalStatus = ApprovalStatus.PendingTeamLeaderReview;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.SubmittedBy;

            AddAudit(
                record.Id,
                "ATA Record Submitted for Approval",
                WorkflowAction.Submitted,
                request.SubmittedBy,
                "Submitted to the review queue; approval actions are now available.");

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // APPROVE  (optional approval comment)
        // =================================================================================

        public async Task<bool> Handle(ApproveATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;
            if (IsFinalized(record)) return false;

            // SCENARIO A: an originator-led record is finalized by the confirmation, so
            // Approve behaves exactly like Confirm. This keeps the existing Approve button
            // working while honouring "once confirmed, the record is finalized immediately".
            if (IsOriginatorLed(record))
            {
                var (mayConfirm, confirmDelegation) = await ResolveConfirmAuthorityAsync(
                    record, request.ActorRole, request.ApprovedBy, request.ActorUserId, cancellationToken);

                if (!mayConfirm) return false;

                Finalize(record, request.ApprovedBy, request.ActorUserId);

                await StampSignatureAsync(
                    record,
                    ATARecordWorkflowCatalog.CurrentStage(record)?.Caption ?? ATARecordWatermark.EditedByCaption,
                    ATARecordWorkflowCatalog.CurrentStage(record)?.SignatureBlock ?? SignatureBlockType.ApprovedBy,
                    record.ApprovalStatus,
                    ApprovalStatus.Approved,
                    request.ApprovedBy,
                    request.ActorRole,
                    request.ActorUserId,
                    WorkflowStepAction.Approved,
                    request.Comments,
                    cancellationToken);

                AddAudit(
                    record.Id,
                    "ATA Record Confirmed and Finalized",
                    WorkflowAction.Completed,
                    request.ApprovedBy,
                    WithDelegationNote(request.Comments, confirmDelegation));

                await _context.SaveChangesAsync(cancellationToken);
                return true;
            }

            // SCENARIO B: only the role owning the current stage — or a live delegate —
            // may advance it. The old handler performed NO role check at all.
            var (allowed, delegation) = await ResolveStageAuthorityAsync(
                record, request.ActorRole, request.ApprovedBy, cancellationToken);

            if (!allowed) return false;

            var signingStage = ATARecordWorkflowCatalog.CurrentStage(record);

            // ATARecordWorkflowCatalog is the single source of truth for the chain. The
            // default chain ends at the Shop Team Leader review, so their acceptance
            // finalizes the record; QA / Director / ECAA are traversed only when the
            // record opted into them.
            var nextStatus = ATARecordWorkflowCatalog.NextStatusAfterApproval(record);
            if (nextStatus == null) return false;

            record.ApprovalStatus = nextStatus.Value;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.ApprovedBy;

            if (nextStatus == ApprovalStatus.Approved)
            {
                Finalize(record, request.ApprovedBy, request.ActorUserId);
            }

            await StampSignatureAsync(
                record,
                signingStage?.Caption ?? ATARecordWatermark.EditedByCaption,
                signingStage?.SignatureBlock ?? SignatureBlockType.ApprovedBy,
                record.ApprovalStatus,
                nextStatus.Value,
                request.ApprovedBy,
                request.ActorRole,
                request.ActorUserId,
                WorkflowStepAction.Approved,
                request.Comments,
                cancellationToken);

            AddAudit(
                record.Id,
                $"ATA Record Approved at {record.ApprovalStatus}",
                record.ApprovalStatus == ApprovalStatus.Approved
                    ? WorkflowAction.Completed
                    : WorkflowAction.Approved,
                request.ApprovedBy,
                WithDelegationNote(request.Comments, delegation));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // CONFIRM  (Scenario A — finalizes immediately, optional comment)
        // =================================================================================

        public async Task<bool> Handle(ConfirmATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;
            if (IsFinalized(record))
            {
                AddAudit(
                    record.Id,
                    "ATA Record Confirmation Denied",
                    WorkflowAction.Updated,
                    request.ConfirmedBy,
                    $"Already finalized: status={record.ApprovalStatus}, actorUserId={request.ActorUserId?.ToString() ?? "null"}");
                await _context.SaveChangesAsync(cancellationToken);
                return false;
            }

            var (allowed, delegation) = IsOriginatorLed(record)
                ? await ResolveConfirmAuthorityAsync(
                    record, request.ActorRole, request.ConfirmedBy, request.ActorUserId, cancellationToken)
                : await ResolveStageAuthorityAsync(
                    record, request.ActorRole, request.ConfirmedBy, cancellationToken);

            if (!allowed)
            {
                AddAudit(
                    record.Id,
                    "ATA Record Confirmation Denied",
                    WorkflowAction.Updated,
                    request.ConfirmedBy,
                    $"Actor not authorised: actorUserId={request.ActorUserId?.ToString() ?? "null"}, actorRole={request.ActorRole}, creatorUserId={record.CreatedByUserId?.ToString() ?? "null"}, creatorRole={record.CreatorRole}, creatorName={record.CreatedBy}, status={record.ApprovalStatus}");
                await _context.SaveChangesAsync(cancellationToken);
                return false;
            }

            // Confirmation is the last signable step unless the record explicitly opted
            // into a trailing authority stage; in that case advance the chain instead of
            // short-circuiting a mandate the record itself asked for.
            var optedIntoExtraStage =
                record.RequiresQAApproval || record.RequiresDirectorApproval || record.RequiresECAAEndorsement;

            if (!IsOriginatorLed(record) && optedIntoExtraStage)
            {
                var nextStatus = ATARecordWorkflowCatalog.NextStatusAfterApproval(record);
                if (nextStatus == null) return false;

                record.ApprovalStatus = nextStatus.Value;
                record.UpdatedAt = DateTime.UtcNow;
                record.UpdatedBy = request.ConfirmedBy;

                if (nextStatus == ApprovalStatus.Approved)
                    Finalize(record, request.ConfirmedBy, request.ActorUserId);
            }
            else
            {
                Finalize(record, request.ConfirmedBy, request.ActorUserId);
            }

            var confirmedStage = ATARecordWorkflowCatalog.ChainFor(record)
                .FirstOrDefault(s => s.Status == record.ApprovalStatus);
            await StampSignatureAsync(
                record,
                confirmedStage?.Caption ?? ATARecordWatermark.CreatedByCaption,
                confirmedStage?.SignatureBlock ?? SignatureBlockType.PreparedBy,
                record.ApprovalStatus,
                record.ApprovalStatus,
                request.ConfirmedBy,
                request.ActorRole,
                request.ActorUserId,
                WorkflowStepAction.Approved,
                request.Comments,
                cancellationToken);

            AddAudit(
                record.Id,
                record.ApprovalStatus == ApprovalStatus.Approved
                    ? "ATA Record Confirmed and Finalized"
                    : $"ATA Record Confirmed, advanced to {record.ApprovalStatus}",
                record.ApprovalStatus == ApprovalStatus.Approved
                    ? WorkflowAction.Completed
                    : WorkflowAction.Approved,
                request.ConfirmedBy,
                WithDelegationNote(request.Comments, delegation));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // RETURN FOR REVISION  (Scenario B — keeps the record alive)
        // =================================================================================

        public async Task<bool> Handle(ReturnATARecordForRevisionCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;
            if (IsFinalized(record)) return false;

            // Comments are mandatory: a negative outcome must always be explained.
            if (string.IsNullOrWhiteSpace(request.Comments)) return false;

            var (allowed, delegation) = await ResolveStageAuthorityAsync(
                record, request.ActorRole, request.ReturnedBy, cancellationToken);

            if (!allowed) return false;

            record.ApprovalStatus = ATARecordWorkflowCatalog.StatusAfterRequestRevision(record);
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.ReturnedBy;

            AddAudit(
                record.Id,
                "ATA Record Returned for Revision",
                WorkflowAction.Updated,
                request.ReturnedBy,
                WithDelegationNote(request.Comments, delegation));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // REJECT
        // =================================================================================

        public async Task<bool> Handle(RejectATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;
            if (IsFinalized(record)) return false;

            if (string.IsNullOrWhiteSpace(request.Reason)) return false;

            // SCENARIO A: no Reject verb exists for a record its own preparer leads —
            // the Shop Team Leader amends it instead of rejecting their own work.
            if (IsOriginatorLed(record)) return false;

            var (allowed, delegation) = await ResolveStageAuthorityAsync(
                record, request.ActorRole, request.RejectedBy, cancellationToken);

            if (!allowed) return false;

            record.ApprovalStatus = ApprovalStatus.Rejected;
            record.RejectionReason = request.Reason;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.RejectedBy;

            AddAudit(
                record.Id,
                "ATA Record Rejected",
                WorkflowAction.Rejected,
                request.RejectedBy,
                WithDelegationNote(request.Reason, delegation));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // REASSIGN / DELEGATE
        // =================================================================================

        public async Task<bool> Handle(ReassignATARecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;
            if (IsFinalized(record)) return false;

            // Only a leader-tier role (or a live delegate of one) may hand authority on.
            var mayDelegate = IsLeaderTier(request.ActorRole);
            ResponsibilityDelegation? actingUnder = null;

            if (!mayDelegate)
            {
                actingUnder = await FindLiveDelegationAsync(
                    request.ReassignedBy, ATAWorkflowResponsibilities.ActionGranting, cancellationToken);
                mayDelegate = actingUnder != null;
            }

            if (!mayDelegate) return false;

            record.AssignedToUserId = request.AssignToUserId;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.ReassignedBy;

            // v24: a delegation must grant the ABILITY TO ACT, not merely move the row.
            // Persist a live ResponsibilityDelegation so the delegatee is authorised for
            // workflow actions at the delegated level on every subsequent request.
            var delegateName = string.IsNullOrWhiteSpace(request.AssignToUserName)
                ? $"user:{request.AssignToUserId}"
                : request.AssignToUserName.Trim();

            var responsibility = string.IsNullOrWhiteSpace(request.Responsibility)
                ? ATAWorkflowResponsibilities.Workflow
                : request.Responsibility.Trim();

            var existing = await _context.ResponsibilityDelegations
                .Where(d => d.DelegatedTo == delegateName
                         && d.Responsibility == responsibility
                         && d.ShopId == record.ShopId
                         && d.Status == DelegationStatus.Active)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing == null)
            {
                _context.ResponsibilityDelegations.Add(new ResponsibilityDelegation
                {
                    Id = Guid.NewGuid(),
                    DelegatedBy = request.ReassignedBy,
                    DelegatedTo = delegateName,
                    Responsibility = responsibility,
                    Scope = $"ATARecord:{record.Id}",
                    Conditions = "Delegated workflow authority: view Table of Contents, edit, submit, approve, reject and return at the delegated role level.",
                    Status = DelegationStatus.Active,
                    EffectiveDate = DateTime.UtcNow,
                    ExpirationDate = request.ExpirationDate,
                    Notes = request.Reason ?? string.Empty,
                    ShopId = record.ShopId,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CreatedBy = request.ReassignedBy,
                    UpdatedBy = request.ReassignedBy
                });
            }
            else
            {
                existing.ExpirationDate = request.ExpirationDate;
                existing.Notes = request.Reason ?? existing.Notes;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedBy = request.ReassignedBy;
            }

            AddAudit(
                record.Id,
                "ATA Record Delegated",
                WorkflowAction.Delegated,
                request.ReassignedBy,
                WithDelegationNote(
                    $"Delegated to {delegateName} (user {request.AssignToUserId}) with responsibility '{responsibility}': {request.Reason}",
                    actingUnder));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // =================================================================================
        // CMM DATA
        // =================================================================================

        /// <summary>
        /// Stores CMM revision data from the external system.
        /// Does NOT enforce Draft/Returned status check — CMM data is reference data
        /// that can be updated at any time regardless of approval workflow status.
        /// Once stored, data persists for that specific part number until explicitly
        /// refreshed with newer source data by the user.
        /// </summary>
        public async Task<bool> Handle(StoreCMMDataCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null || !record.IsActive) return false;

            record.RevNo = request.RevNo ?? string.Empty;
            record.CMMRevDate = request.CMMRevDate ?? string.Empty;
            record.CMMPdfUrl = request.CMMPdfUrl ?? string.Empty;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.UpdatedBy;

            AddAudit(
                record.Id,
                "CMM Data Stored",
                WorkflowAction.Updated,
                request.UpdatedBy,
                $"CMM Rev: {request.RevNo}, Date: {request.CMMRevDate}, PDF: {(string.IsNullOrEmpty(request.CMMPdfUrl) ? "N/A" : "Available")}");

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}