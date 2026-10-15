using System;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    [ApiController]
    [Route("api/self-evaluation/archive")]
    [Authorize]
    public class ArchiveController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly ICurrentUserAccessor _currentUser;

        public ArchiveController(ApplicationDbContext context, ICurrentUserAccessor currentUser)
        {
            _context = context;
            _currentUser = currentUser;
        }

        [HttpGet]
        public async Task<IActionResult> List(
            [FromQuery] string scope = "archived",
            [FromQuery] int? itemKind = null,
            [FromQuery] string? search = null,
            CancellationToken cancellationToken = default)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null) return Unauthorized();

            var query = _context.ArchiveEntries.AsNoTracking().AsQueryable();
            query = scope.Equals("history", StringComparison.OrdinalIgnoreCase)
                ? query
                : scope.Equals("purge-requested", StringComparison.OrdinalIgnoreCase)
                    ? query.Where(a => a.State == ArchiveEntryState.PurgeRequested)
                    : query.Where(a => a.State == ArchiveEntryState.Archived);

            if (itemKind.HasValue && Enum.IsDefined(typeof(ArchivedItemKind), itemKind.Value))
                query = query.Where(a => a.ItemKind == (ArchivedItemKind)itemKind.Value);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(a => a.ItemTitle.Contains(search) || a.ItemReference.Contains(search));

            var rows = await query.OrderByDescending(a => a.ArchivedAt).Take(500).ToListAsync(cancellationToken);
            return Ok(rows);
        }

        [HttpGet("{entryId:guid}")]
        public async Task<IActionResult> Get(Guid entryId, CancellationToken cancellationToken)
        {
            var entry = await _context.ArchiveEntries.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == entryId, cancellationToken);
            return entry is null ? NotFound() : Ok(entry);
        }

        [HttpPost]
        public async Task<IActionResult> Archive(
            [FromBody] ArchiveItemRequest request,
            CancellationToken cancellationToken)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null) return Unauthorized();
            var actorRole = RoleHierarchy.Normalize(user.Role) ?? user.Role;
            if (!ArchivePolicy.HasAuthorityRole(actorRole))
                return StatusCode(403, new { code = ArchiveDenialCodes.NotAuthorizedRole, message = "Only QA, Director, ECAA or Admin may archive a form." });
            if (request.ItemKind != ArchivedItemKind.Form)
                return BadRequest(new { code = "ARCHIVE_FORM_ONLY", message = "Only completed forms are archived by this workflow." });
            if (string.IsNullOrWhiteSpace(request.Reason))
                return BadRequest(new { code = ArchiveDenialCodes.ReasonRequired, message = "A deletion reason is required." });

            var form = await _context.FormSubmissions.FirstOrDefaultAsync(
                f => f.Id == request.ItemId && f.IsActive, cancellationToken);
            if (form is null) return NotFound();
            if (form.FormType != FormNodeTypes.Form918FAA
                && form.FormType != FormNodeTypes.Form918ACAA)
                return BadRequest(new { code = "ARCHIVE_FORM_NOT_SUPPORTED", message = "Only 918 FAA or 918A CAA forms support deletion archiving." });
            if (!IsDeletionRequested(form.FormDataJson))
                return BadRequest(new { code = "ARCHIVE_DELETION_NOT_SELECTED", message = "Select Deletion on the form before archiving it." });
            if (form.ApprovalStatus != ApprovalStatus.Approved)
                return BadRequest(new { code = "ARCHIVE_FORM_NOT_APPROVED", message = "The form must be fully approved before archiving." });

            var ata = await _context.ATARecords.Include(r => r.Shop)
                .FirstOrDefaultAsync(r => r.Id == form.ATARecordId, cancellationToken);
            if (ata is null) return NotFound();

            var now = DateTime.UtcNow;
            var entry = CreateFormEntry(form, ata, user, request.Trigger, request.Reason, now);
            form.IsActive = false;
            form.ApprovalStatus = ApprovalStatus.Revoked;
            form.UpdatedAt = now;
            form.UpdatedBy = user.FullName;
            _context.ArchiveEntries.Add(entry);
            await _context.SaveChangesAsync(cancellationToken);
            return CreatedAtAction(nameof(Get), new { entryId = entry.Id }, entry);
        }

        [HttpPost("{entryId:guid}/restore")]
        public async Task<IActionResult> Restore(
            Guid entryId,
            [FromBody] RestoreRequest request,
            CancellationToken cancellationToken)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null) return Unauthorized();
            var role = RoleHierarchy.Normalize(user.Role) ?? user.Role;
            if (!string.Equals(role, OrgRoles.TeamLeader, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(role, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { code = ArchiveDenialCodes.NotAuthorizedRole, message = "Only the Shop Team Leader may restore an archived form." });
            if (string.IsNullOrWhiteSpace(request.Reason))
                return BadRequest(new { code = ArchiveDenialCodes.ReasonRequired, message = "A restore reason is required." });

            var entry = await _context.ArchiveEntries.FirstOrDefaultAsync(a => a.Id == entryId, cancellationToken);
            if (entry is null) return NotFound();
            if (!entry.IsRestorable) return BadRequest(new { code = ArchiveDenialCodes.EntryNotRestorable, message = "This archive entry is already closed." });
            if (entry.ItemKind != ArchivedItemKind.Form) return BadRequest(new { message = "Only archived forms can be restored here." });

            var form = await _context.FormSubmissions.FirstOrDefaultAsync(f => f.Id == entry.ItemId, cancellationToken);
            if (form is null) return NotFound();
            var now = DateTime.UtcNow;
            form.IsActive = true;
            form.ApprovalStatus = ApprovalStatus.Draft;
            form.RevisionNumber++;
            form.SubmittedByUserId = null;
            form.SubmittedDate = null;
            form.ReviewedByUserId = null;
            form.ReviewedDate = null;
            form.ApprovedByUserId = null;
            form.ApprovedDate = null;
            form.CurrentApproverUserId = null;
            form.RejectionReason = string.Empty;
            form.ReviewComments = string.Empty;
            form.FormDataJson = ClearDeletionFlag(form.FormDataJson);
            form.UpdatedAt = now;
            form.UpdatedBy = user.FullName;

            var instance = await _context.WorkflowInstances.Include(i => i.Steps)
                .FirstOrDefaultAsync(i => i.FormSubmissionId == form.Id, cancellationToken);
            if (instance is not null)
            {
                instance.Status = ApprovalStatus.Draft;
                instance.CurrentStepNo = 0;
                instance.CurrentAssigneeUserId = null;
                instance.SubmittedAt = null;
                instance.CompletedAt = null;
                instance.IsComplete = false;
                instance.IsLocked = false;
                instance.RevisionNumber++;
                foreach (var step in instance.Steps)
                {
                    step.State = WorkflowStepState.NotStarted;
                    step.ActionTaken = WorkflowStepAction.None;
                    step.ActedByUserId = null;
                    step.ActedByName = string.Empty;
                    step.ActedAt = null;
                    step.Comments = string.Empty;
                    step.SignatureName = string.Empty;
                    step.SignatureRole = string.Empty;
                    step.SignatureDate = null;
                    step.SignatureHash = string.Empty;
                    step.UserSignatureId = null;
                    step.SignatureStoragePath = null;
                    step.SignatureImageApplied = false;
                }
            }

            entry.State = ArchiveEntryState.Restored;
            entry.RestoredByUserId = user.Id;
            entry.RestoredByName = user.FullName;
            entry.RestoredByRole = role;
            entry.RestoredAt = now;
            entry.RestoreReason = request.Reason.Trim();
            entry.StatusAfterRestore = ApprovalStatus.Draft;
            entry.RevisionNumberAfterRestore = form.RevisionNumber;
            entry.UpdatedAt = now;
            await _context.SaveChangesAsync(cancellationToken);
            return Ok(entry);
        }

        [HttpPut("{entryId:guid}/edit")]
        public async Task<IActionResult> Edit(Guid entryId, [FromBody] EditRequest request, CancellationToken cancellationToken)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null) return Unauthorized();
            var role = RoleHierarchy.Normalize(user.Role) ?? user.Role;
            if (!string.Equals(role, OrgRoles.TeamLeader, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(role, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
                return StatusCode(403, new { code = ArchiveDenialCodes.NotAuthorizedRole, message = "Only the Shop Team Leader may edit an archived form." });

            var entry = await _context.ArchiveEntries.FirstOrDefaultAsync(a => a.Id == entryId, cancellationToken);
            if (entry is null) return NotFound();
            if (!entry.IsCurrentlyArchived) return BadRequest(new { code = ArchiveDenialCodes.NotArchived, message = "The archive entry is no longer active." });
            var form = await _context.FormSubmissions.FirstOrDefaultAsync(f => f.Id == entry.ItemId, cancellationToken);
            if (form is null) return NotFound();
            if (!string.IsNullOrWhiteSpace(request.FormDataJson))
                form.FormDataJson = request.FormDataJson;
            ArchivePolicy.RecordEditWhileArchived(entry, user.Id, user.FullName, DateTime.UtcNow);
            await _context.SaveChangesAsync(cancellationToken);
            return Ok(entry);
        }

        private static ArchiveEntry CreateFormEntry(FormSubmission form, ATARecord ata, User user, ArchiveTrigger trigger, string reason, DateTime now)
            => new()
            {
                Id = Guid.NewGuid(), ItemKind = ArchivedItemKind.Form, ItemId = form.Id,
                ATARecordId = form.ATARecordId, ItemTitle = form.FormType, ItemReference = form.FormNo,
                SectionCode = form.FormType, FormType = form.FormType, ATAChapterCode = ata.ATAChapterCode,
                ShopId = ata.ShopId, ShopName = ata.Shop?.Name ?? string.Empty,
                StatusBeforeArchive = form.ApprovalStatus, StatusBeforeArchiveLabel = ApprovalStatusInfo.Label(form.ApprovalStatus),
                RevisionNumberBeforeArchive = form.RevisionNumber,
                WasApprovedBeforeArchive = ApprovalStatusInfo.CountsAsComplete(form.ApprovalStatus),
                Trigger = trigger, ArchivedByUserId = user.Id, ArchivedByName = user.FullName,
                ArchivedByRole = RoleHierarchy.Normalize(user.Role) ?? user.Role, ArchivedAt = now,
                Reason = reason.Trim(), State = ArchiveEntryState.Archived, CreatedAt = now, UpdatedAt = now
            };

        private static string ClearDeletionFlag(string json)
        {
            try
            {
                var root = JsonNode.Parse(json) as JsonObject;
                if (root is null) return json;
                root["deletion"] = false;
                return root.ToJsonString();
            }
            catch (JsonException)
            {
                return json;
            }
        }

        private static bool IsDeletionRequested(string json)
        {
            try
            {
                var root = JsonNode.Parse(json) as JsonObject;
                return root?["deletion"]?.GetValue<bool>() == true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        public sealed class ArchiveItemRequest
        {
            public ArchivedItemKind ItemKind { get; set; }
            public Guid ItemId { get; set; }
            public ArchiveTrigger Trigger { get; set; }
            public string Reason { get; set; } = string.Empty;
        }

        public sealed class RestoreRequest { public string Reason { get; set; } = string.Empty; }
        public sealed class EditRequest { public string? FormDataJson { get; set; } public string? Reason { get; set; } }
    }
}
