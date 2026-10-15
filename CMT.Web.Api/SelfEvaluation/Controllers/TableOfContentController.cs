using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation.Forms;
using CMT.Domain.Models.Shared;
using User = CMT.Domain.Models.SelfEvaluation.User;
using RecordStatus = CMT.Domain.Models.Shared.RecordStatus;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// Table Of Content Controller - AMENDED v4.
    ///
    /// This is the endpoint behind the "TABLE OF CONTENT" node of your tree. The
    /// approval buttons on that form were the ones failing, because the workflow had
    /// no server-side notion of "who is the current approver".
    ///
    /// Implemented here:
    /// - CRUD per ATA record and shop, including the CMM Status sub-section, the
    ///   Task Card list, the Others list and the Prepared / Reviewed / Approved
    ///   signature-and-date blocks.
    /// - Workflow: Draft -> Submitted (Under Review) -> Approved / Rejected, with
    ///   Approve, Reject (reason mandatory) and Delegate actions.
    /// - The next approver is resolved from the reporting hierarchy
    ///   (HierarchyRuleService), stored in CurrentApproverUserId, and re-checked on
    ///   the server before any action - the UI hiding a button is never the only gate.
    /// - "Pending my approval" inbox per user.
    /// - Append-only WorkflowAuditLog entries for
    ///   Created / Updated / Submitted / Approved / Rejected / Delegated.
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/table-of-content")]
    [Authorize]
    public class TableOfContentController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly HierarchyRuleService _rules;

        public TableOfContentController(ApplicationDbContext context, HierarchyRuleService rules)
        {
            _context = context;
            _rules = rules;
        }

        #region Helpers

        private long GetCurrentUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub");
            return long.TryParse(claim?.Value, out var id) ? id : 0;
        }

        private string CurrentActorName()
            => User.FindFirst("fullName")?.Value
            ?? User.FindFirst("FullName")?.Value
            ?? User.Identity?.Name
            ?? "system";

        private async Task<User?> GetCurrentUserAsync()
        {
            var id = GetCurrentUserId();
            if (id == 0) return null;
            return await _context.Users
                .FirstOrDefaultAsync(u => u.Id == id && u.RecordStatus != RecordStatus.Deleted);
        }

        private ObjectResult ValidationFailure(Dictionary<string, string[]> errors, string title)
            => StatusCode(StatusCodes.Status422UnprocessableEntity, new ValidationProblemDetails(errors)
            {
                Title = title,
                Status = StatusCodes.Status422UnprocessableEntity,
                Detail = "One or more fields are invalid. Fix the highlighted fields and submit again."
            });

        private ObjectResult SingleFieldFailure(string field, string message, string? title = null)
            => ValidationFailure(new Dictionary<string, string[]> { [field] = new[] { message } },
                                 title ?? "Validation failed");

        private void AddAudit(WorkflowAction action, Guid entityId, string details, string previous = "", string current = "")
        {
            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = action.ToString(),
                WorkflowAction = action,
                EntityType = nameof(TableOfContent),
                EntityId = entityId,
                PerformedBy = $"{CurrentActorName()} (#{GetCurrentUserId()})",
                Details = Truncate(details, 2000),
                PreviousValues = Truncate(previous, 2000),
                NewValues = Truncate(current, 2000),
                IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                Timestamp = DateTime.UtcNow
            });
        }

        private static string Truncate(string value, int max)
            => string.IsNullOrEmpty(value) || value.Length <= max ? value : value[..max];

        /// <summary>
        /// Resolves the user who must act at <paramref name="status"/> for a record
        /// owned by <paramref name="originatorId"/>: walks up the reporting chain and
        /// picks the first supervisor whose role is an approver for that stage and who
        /// actually holds the approve permission.
        /// </summary>
        private async Task<User?> ResolveApproverAsync(long originatorId, Guid? shopId, ApprovalStatus status)
        {
            var approverRoles = RoleHierarchy.ApproverRolesFor(status);
            if (approverRoles.Length == 0) return null;

            // ===== AMENDED v13 - READ-PATH FIX FOR THE "DISAPPEARING APPROVERS" DEFECT =====
            // approverRoles are CANONICAL OrgRoles values ("TeamLeader", "Director", ...),
            // but the Users.Role column may still hold a LEGACY persisted spelling
            // ("team_leader", "director", "shop_tl", "admin"). Matching the canonical list
            // against the raw column silently returned NOBODY, so CurrentApproverUserId
            // stayed null and the approval inbox looked empty even though a valid approver
            // existed. PersistedVariants expands every canonical role into all spellings
            // that may legitimately sit in the column - the exact fix HierarchyRuleService
            // .ResolveApproverAsync already applies. The step-1 loop above keeps using the
            // canonical list because it compares against Normalize(candidate.Role).
            var approverVariants = RoleHierarchy.PersistedVariants(approverRoles);

            var chain = await _rules.GetSupervisorChainAsync(originatorId);

            // 1. Nearest supervisor in the chain whose role can act at this stage.
            foreach (var candidate in chain)
            {
                var role = RoleHierarchy.Normalize(candidate.Role);
                if (role is null || !approverRoles.Contains(role)) continue;
                if (!candidate.IsActive) continue;
                if (!RoleHierarchy.HasPermission(candidate.Role, candidate.AdditionalPermissions,
                                                 candidate.RevokedPermissions, Permissions.ApproveForm)) continue;
                return candidate;
            }

            // 2. Fallback inside the same shop (several Shop TLs share a shop scope).
            if (shopId.HasValue)
            {
                var shopApprover = await _context.Users
                    .Where(u => u.ShopId == shopId
                             && u.IsActive
                             && u.Id != originatorId
                             && u.RecordStatus != RecordStatus.Deleted
                             && approverVariants.Contains(u.Role))
                    .OrderBy(u => u.FullName)
                    .FirstOrDefaultAsync();

                if (shopApprover is not null) return shopApprover;
            }

            // 3. Last resort: any active holder of an approver role for this stage.
            return await _context.Users
                .Where(u => u.IsActive
                         && u.Id != originatorId
                         && u.RecordStatus != RecordStatus.Deleted
                         && approverVariants.Contains(u.Role))
                .OrderBy(u => u.FullName)
                .FirstOrDefaultAsync();
        }

        /// <summary>
        /// Server-side re-check: is <paramml name="user"/> genuinely the current
        /// approver of <paramref name="form"/>? Admin is always allowed as a
        /// break-glass path; a delegate is allowed while the delegation is active.
        /// </summary>
        private static bool IsCurrentApprover(TableOfContent form, User user)
        {
            if (RoleHierarchy.Normalize(user.Role) == OrgRoles.Admin) return true;
            if (form.CurrentApproverUserId == user.Id) return true;
            if (form.DelegatedToUserId == user.Id) return true;
            return false;
        }

        private static bool CanEdit(TableOfContent form, User user)
        {
            if (RoleHierarchy.Normalize(user.Role) == OrgRoles.Admin) return true;
            if (!RoleHierarchy.HasPermission(user.Role, user.AdditionalPermissions,
                                             user.RevokedPermissions, Permissions.EditForm)) return false;

            // Draft / Rejected records are editable by the originator or shop staff.
            if (form.ApprovalStatus is ApprovalStatus.Draft or ApprovalStatus.Rejected or ApprovalStatus.Returned)
                return form.PreparedByUserId == user.Id
                    || (user.ShopId.HasValue && user.ShopId.Value == form.ShopId);

            // While in the chain only the current approver may amend.
            return IsCurrentApprover(form, user);
        }

        private object Project(TableOfContent f, User currentUser, string? approverName = null)
        {
            var pending = RoleHierarchy.IsPending(f.ApprovalStatus);
            var isApprover = IsCurrentApprover(f, currentUser);
            var canApprove = pending && isApprover &&
                RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                            currentUser.RevokedPermissions, Permissions.ApproveForm);
            var canDelegate = pending && isApprover &&
                RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                            currentUser.RevokedPermissions, Permissions.DelegateForm);

            return new
            {
                f.Id,
                f.ATARecordId,
                f.ShopId,
                f.FormNumber,
                f.RevisionNumber,
                f.RevisionDate,
                f.Title,
                f.ATAChapterCode,
                f.ComponentPartNumber,
                f.ComponentDescription,

                cmmStatus = new
                {
                    documentNumber = f.CMMDocumentNumber,
                    revision = f.CMMRevision,
                    revisionDate = f.CMMRevisionDate,
                    publisher = f.CMMPublisher,
                    status = f.CMMStatus.ToString(),
                    remarks = f.CMMRemarks
                },

                taskCardsJson = f.TaskCardsJson,
                otherDocumentsJson = f.OtherDocumentsJson,
                contentItemsJson = f.ContentItemsJson,

                signatures = new
                {
                    preparedBy = f.PreparedBy,
                    preparedDate = f.PreparedDate,
                    reviewedBy = f.ReviewedBy,
                    reviewedDate = f.ReviewedDate,
                    approvedBy = f.ApprovedBy,
                    approvedDate = f.ApprovedDate
                },

                workflow = new
                {
                    status = f.ApprovalStatus.ToString(),
                    statusCode = (int)f.ApprovalStatus,
                    isPending = pending,
                    f.PreparedByUserId,
                    f.SubmittedByUserId,
                    f.SubmittedDate,
                    f.ReviewedByUserId,
                    f.ApprovedByUserId,
                    f.CurrentApproverUserId,
                    currentApproverName = approverName,
                    f.ReviewComments,
                    f.RejectionReason,
                    f.DelegatedToUserId,
                    f.DelegatedDate,
                    f.DelegationReason,
                    approverRoles = RoleHierarchy.ApproverRolesFor(f.ApprovalStatus)
                },

                permissions = new
                {
                    canEdit = CanEdit(f, currentUser),
                    canSubmit = f.ApprovalStatus is ApprovalStatus.Draft or ApprovalStatus.Rejected or ApprovalStatus.Returned
                                && CanEdit(f, currentUser),
                    canApprove,
                    canReject = canApprove,
                    canDelegate
                },

                f.IsActive,
                f.CreatedAt,
                f.UpdatedAt,
                f.CreatedBy,
                f.UpdatedBy
            };
        }

        /// <summary>Shop ids the caller may read/write.</summary>
        private async Task<HashSet<Guid>> GetScopedShopIdsAsync(User currentUser)
        {
            var role = RoleHierarchy.Normalize(currentUser.Role);

            if (role is OrgRoles.Admin or OrgRoles.Director or OrgRoles.Manager or OrgRoles.SpecialTeamLeader)
            {
                var all = await _context.Shops.AsNoTracking().Select(s => s.Id).ToListAsync();
                return all.ToHashSet();
            }

            var visibleIds = await _rules.GetVisibleUserIdsAsync(currentUser);

            var shops = await _context.Users
                .AsNoTracking()
                .Where(u => visibleIds.Contains(u.Id) && u.ShopId.HasValue)
                .Select(u => u.ShopId!.Value)
                .Distinct()
                .ToListAsync();

            var result = shops.ToHashSet();
            if (currentUser.ShopId.HasValue) result.Add(currentUser.ShopId.Value);
            return result;
        }

        #endregion

        #region GET

        /// <summary>
        /// List Table Of Content submissions inside the caller's shop scope.
        /// GET /api/self-evaluation/table-of-content?ataRecordId=...&amp;shopId=...&amp;status=Draft
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetList(
            [FromQuery] Guid? ataRecordId = null,
            [FromQuery] Guid? shopId = null,
            [FromQuery] string? status = null)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var scopedShops = await GetScopedShopIdsAsync(currentUser);

            var query = _context.TableOfContents
                .AsNoTracking()
                .Where(t => t.IsActive && scopedShops.Contains(t.ShopId));

            if (ataRecordId.HasValue)
                query = query.Where(t => t.ATARecordId == ataRecordId.Value);

            if (shopId.HasValue)
                query = query.Where(t => t.ShopId == shopId.Value);

            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ApprovalStatus>(status, true, out var parsed))
                query = query.Where(t => t.ApprovalStatus == parsed);

            var forms = await query.OrderByDescending(t => t.UpdatedAt).ToListAsync();

            var approverIds = forms.Where(f => f.CurrentApproverUserId.HasValue)
                                   .Select(f => f.CurrentApproverUserId!.Value)
                                   .Distinct()
                                   .ToList();

            var approverNames = await _context.Users
                .AsNoTracking()
                .Where(u => approverIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.FullName);

            var result = forms.Select(f => Project(
                f,
                currentUser,
                f.CurrentApproverUserId.HasValue && approverNames.TryGetValue(f.CurrentApproverUserId.Value, out var n) ? n : null));

            return Ok(result);
        }

        /// <summary>GET /api/self-evaluation/table-of-content/{id}</summary>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var form = await _context.TableOfContents.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            var scopedShops = await GetScopedShopIdsAsync(currentUser);
            if (!scopedShops.Contains(form.ShopId))
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "This record is outside your shop scope" });

            string? approverName = null;
            if (form.CurrentApproverUserId.HasValue)
                approverName = await _context.Users.AsNoTracking()
                    .Where(u => u.Id == form.CurrentApproverUserId.Value)
                    .Select(u => u.FullName)
                    .FirstOrDefaultAsync();

            return Ok(Project(form, currentUser, approverName));
        }

        /// <summary>
        /// "Pending my approval" queue.
        /// GET /api/self-evaluation/table-of-content/pending-my-approval
        /// </summary>
        [HttpGet("pending-my-approval")]
        public async Task<IActionResult> GetPendingMyApproval()
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var forms = await _context.TableOfContents
                .AsNoTracking()
                .Where(t => t.IsActive
                         && (t.CurrentApproverUserId == currentUser.Id || t.DelegatedToUserId == currentUser.Id))
                .OrderBy(t => t.SubmittedDate)
                .ToListAsync();

            var pending = forms.Where(f => RoleHierarchy.IsPending(f.ApprovalStatus)).ToList();

            return Ok(new
            {
                count = pending.Count,
                items = pending.Select(f => new
                {
                    f.Id,
                    f.ATARecordId,
                    f.ShopId,
                    f.FormNumber,
                    f.Title,
                    f.ATAChapterCode,
                    f.ComponentPartNumber,
                    status = f.ApprovalStatus.ToString(),
                    f.SubmittedByUserId,
                    f.SubmittedDate,
                    isDelegatedToMe = f.DelegatedToUserId == currentUser.Id,
                    f.DelegationReason
                })
            });
        }

        /// <summary>
        /// Append-only audit trail of a record.
        /// GET /api/self-evaluation/table-of-content/{id}/audit-trail
        /// </summary>
        [HttpGet("{id:guid}/audit-trail")]
        public async Task<IActionResult> GetAuditTrail(Guid id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var logs = await _context.WorkflowAuditLogs
                .AsNoTracking()
                .Where(l => l.EntityType == nameof(TableOfContent) && l.EntityId == id)
                .OrderByDescending(l => l.Timestamp)
                .Select(l => new
                {
                    l.Id,
                    l.Action,
                    workflowAction = l.WorkflowAction.ToString(),
                    l.PerformedBy,
                    l.Details,
                    l.PreviousValues,
                    l.NewValues,
                    l.Timestamp
                })
                .ToListAsync();

            return Ok(logs);
        }

        #endregion

        #region POST / PUT - form module

        /// <summary>POST /api/self-evaluation/table-of-content</summary>
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] TableOfContentUpsertRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var errors = new Dictionary<string, string[]>();

            if (!request.ATARecordId.HasValue || request.ATARecordId == Guid.Empty)
                errors["ataRecordId"] = new[] { "An ATA record is required." };

            if (!request.ShopId.HasValue || request.ShopId == Guid.Empty)
                errors["shopId"] = new[] { "A shop is required." };

            if (string.IsNullOrWhiteSpace(request.Title))
                errors["title"] = new[] { "Title is required." };

            if (errors.Count > 0)
                return ValidationFailure(errors, "Cannot create Table of Content");

            if (!RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                             currentUser.RevokedPermissions, Permissions.CreateForm))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Your role cannot create forms." });

            var scopedShops = await GetScopedShopIdsAsync(currentUser);
            if (!scopedShops.Contains(request.ShopId!.Value))
                return SingleFieldFailure("shopId", "You cannot create records for this shop.", "Cannot create Table of Content");

            var actor = CurrentActorName();
            var form = new TableOfContent
            {
                Id = Guid.NewGuid(),
                ATARecordId = request.ATARecordId!.Value,
                ShopId = request.ShopId!.Value,
                FormNumber = request.FormNumber ?? string.Empty,
                RevisionNumber = request.RevisionNumber ?? string.Empty,
                RevisionDate = request.RevisionDate,
                Title = request.Title!.Trim(),
                ATAChapterCode = request.ATAChapterCode ?? string.Empty,
                ComponentPartNumber = request.ComponentPartNumber ?? string.Empty,
                ComponentDescription = request.ComponentDescription ?? string.Empty,

                CMMDocumentNumber = request.CMMDocumentNumber ?? string.Empty,
                CMMRevision = request.CMMRevision ?? string.Empty,
                CMMRevisionDate = request.CMMRevisionDate,
                CMMPublisher = request.CMMPublisher ?? string.Empty,
                CMMStatus = ParseCmmStatus(request.CMMStatus),
                CMMRemarks = request.CMMRemarks ?? string.Empty,

                TaskCardsJson = request.TaskCardsJson ?? "[]",
                OtherDocumentsJson = request.OtherDocumentsJson ?? "[]",
                ContentItemsJson = request.ContentItemsJson ?? "[]",

                PreparedBy = string.IsNullOrWhiteSpace(request.PreparedBy) ? currentUser.FullName : request.PreparedBy!.Trim(),
                PreparedDate = request.PreparedDate ?? DateTime.UtcNow,
                PreparedByUserId = currentUser.Id,

                ApprovalStatus = ApprovalStatus.Draft,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = actor,
                UpdatedBy = actor
            };

            _context.TableOfContents.Add(form);
            AddAudit(WorkflowAction.Created, form.Id, $"Table of Content '{form.Title}' created as Draft");
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = form.Id }, Project(form, currentUser));
        }

        /// <summary>PUT /api/self-evaluation/table-of-content/{id}</summary>
        [HttpPut("{id:guid}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] TableOfContentUpsertRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            if (request is null)
                return SingleFieldFailure("request", "A request body is required.");

            var form = await _context.TableOfContents.FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            var scopedShops = await GetScopedShopIdsAsync(currentUser);
            if (!scopedShops.Contains(form.ShopId))
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "This record is outside your shop scope" });

            if (!CanEdit(form, currentUser))
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    message = form.ApprovalStatus == ApprovalStatus.Approved
                        ? "An approved Table of Content can no longer be edited."
                        : "Only the current approver can edit a record that is under review."
                });

            var previous = $"Title={form.Title}; CMM={form.CMMDocumentNumber} rev {form.CMMRevision}";

            if (request.Title is not null) form.Title = request.Title.Trim();
            if (request.FormNumber is not null) form.FormNumber = request.FormNumber;
            if (request.RevisionNumber is not null) form.RevisionNumber = request.RevisionNumber;
            if (request.RevisionDate.HasValue) form.RevisionDate = request.RevisionDate;
            if (request.ATAChapterCode is not null) form.ATAChapterCode = request.ATAChapterCode;
            if (request.ComponentPartNumber is not null) form.ComponentPartNumber = request.ComponentPartNumber;
            if (request.ComponentDescription is not null) form.ComponentDescription = request.ComponentDescription;

            if (request.CMMDocumentNumber is not null) form.CMMDocumentNumber = request.CMMDocumentNumber;
            if (request.CMMRevision is not null) form.CMMRevision = request.CMMRevision;
            if (request.CMMRevisionDate.HasValue) form.CMMRevisionDate = request.CMMRevisionDate;
            if (request.CMMPublisher is not null) form.CMMPublisher = request.CMMPublisher;
            if (request.CMMStatus is not null) form.CMMStatus = ParseCmmStatus(request.CMMStatus);
            if (request.CMMRemarks is not null) form.CMMRemarks = request.CMMRemarks;

            if (request.TaskCardsJson is not null) form.TaskCardsJson = request.TaskCardsJson;
            if (request.OtherDocumentsJson is not null) form.OtherDocumentsJson = request.OtherDocumentsJson;
            if (request.ContentItemsJson is not null) form.ContentItemsJson = request.ContentItemsJson;

            if (request.PreparedBy is not null) form.PreparedBy = request.PreparedBy;
            if (request.PreparedDate.HasValue) form.PreparedDate = request.PreparedDate;

            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = CurrentActorName();

            AddAudit(WorkflowAction.Updated, form.Id, "Table of Content updated", previous,
                     $"Title={form.Title}; CMM={form.CMMDocumentNumber} rev {form.CMMRevision}");

            await _context.SaveChangesAsync();

            return Ok(Project(form, currentUser));
        }

        #endregion

        #region Workflow actions

        /// <summary>
        /// Draft -> Submitted / Under Review. The next approver is resolved from the
        /// hierarchy and persisted, which is what feeds the approval inbox.
        /// POST /api/self-evaluation/table-of-content/{id}/submit
        /// </summary>
        [HttpPost("{id:guid}/submit")]
        public async Task<IActionResult> Submit(Guid id)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var form = await _context.TableOfContents.FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            if (form.ApprovalStatus is not (ApprovalStatus.Draft or ApprovalStatus.Rejected or ApprovalStatus.Returned))
                return SingleFieldFailure("status",
                    $"Only a Draft or Rejected record can be submitted. This record is '{form.ApprovalStatus}'.",
                    "Cannot submit");

            if (!RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                             currentUser.RevokedPermissions, Permissions.SubmitForm))
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Your role cannot submit forms." });

            var originatorId = form.PreparedByUserId ?? currentUser.Id;
            var firstStatus = RoleHierarchy.FirstStatusAfterSubmit();
            var approver = await ResolveApproverAsync(originatorId, form.ShopId, firstStatus);

            if (approver is null)
                return SingleFieldFailure("supervisorUserId",
                    "No approver could be resolved from the reporting chain. Assign a Shop Team Leader or Shop Manager above the originator first.",
                    "Cannot submit");

            var previous = form.ApprovalStatus.ToString();

            form.ApprovalStatus = firstStatus;
            form.SubmittedByUserId = currentUser.Id;
            form.SubmittedDate = DateTime.UtcNow;
            form.CurrentApproverUserId = approver.Id;
            form.DelegatedToUserId = null;
            form.DelegatedDate = null;
            form.DelegationReason = string.Empty;
            form.RejectionReason = string.Empty;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = CurrentActorName();

            AddAudit(WorkflowAction.Submitted, form.Id,
                     $"Submitted for review. Next approver: {approver.FullName} ({approver.Role})",
                     previous, form.ApprovalStatus.ToString());

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Submitted. Pending {RoleHierarchy.DisplayNames[RoleHierarchy.Normalize(approver.Role) ?? OrgRoles.TeamLeader]} '{approver.FullName}'.",
                form = Project(form, currentUser, approver.FullName)
            });
        }

        /// <summary>
        /// Approve the current stage. Advances along the chain, or reaches Approved.
        /// POST /api/self-evaluation/table-of-content/{id}/approve
        /// </summary>
        [HttpPost("{id:guid}/approve")]
        public async Task<IActionResult> Approve(Guid id, [FromBody] WorkflowActionRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var form = await _context.TableOfContents.FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            if (!RoleHierarchy.IsPending(form.ApprovalStatus))
                return SingleFieldFailure("status",
                    $"This record is '{form.ApprovalStatus}' and is not awaiting approval.", "Cannot approve");

            // Server side re-check - the hidden button is never the only gate.
            if (!IsCurrentApprover(form, currentUser))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You are not the current approver of this record." });

            if (!RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                             currentUser.RevokedPermissions, Permissions.ApproveForm))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Your approve privilege has been revoked." });

            var previous = form.ApprovalStatus.ToString();
            var actor = CurrentActorName();
            var next = RoleHierarchy.NextStatusAfterApproval(form.ApprovalStatus);

            // Record the signature block for the stage just completed.
            if (form.ApprovalStatus == ApprovalStatus.PendingTeamLeaderReview)
            {
                form.ReviewedByUserId = currentUser.Id;
                form.ReviewedBy = currentUser.FullName;
                form.ReviewedDate = DateTime.UtcNow;
            }

            if (!string.IsNullOrWhiteSpace(request?.Comments))
                form.ReviewComments = request!.Comments!.Trim();

            if (next == ApprovalStatus.Approved)
            {
                form.ApprovalStatus = ApprovalStatus.Approved;
                form.ApprovedByUserId = currentUser.Id;
                form.ApprovedBy = currentUser.FullName;
                form.ApprovedDate = DateTime.UtcNow;
                form.CurrentApproverUserId = null;
            }
            else
            {
                var originatorId = form.PreparedByUserId ?? form.SubmittedByUserId ?? currentUser.Id;
                var nextApprover = await ResolveApproverAsync(originatorId, form.ShopId, next);

                if (nextApprover is null)
                {
                    // No one holds the next stage: finalise instead of dead-ending.
                    form.ApprovalStatus = ApprovalStatus.Approved;
                    form.ApprovedByUserId = currentUser.Id;
                    form.ApprovedBy = currentUser.FullName;
                    form.ApprovedDate = DateTime.UtcNow;
                    form.CurrentApproverUserId = null;
                }
                else
                {
                    form.ApprovalStatus = next;
                    form.CurrentApproverUserId = nextApprover.Id;
                }
            }

            form.DelegatedToUserId = null;
            form.DelegatedDate = null;
            form.DelegationReason = string.Empty;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor;

            AddAudit(WorkflowAction.Approved, form.Id,
                     $"Approved at stage '{previous}' by {actor}", previous, form.ApprovalStatus.ToString());

            await _context.SaveChangesAsync();

            string? approverName = null;
            if (form.CurrentApproverUserId.HasValue)
                approverName = await _context.Users.AsNoTracking()
                    .Where(u => u.Id == form.CurrentApproverUserId.Value)
                    .Select(u => u.FullName).FirstOrDefaultAsync();

            return Ok(new
            {
                message = form.ApprovalStatus == ApprovalStatus.Approved
                    ? "Record fully approved."
                    : $"Approved. Now pending '{approverName}'.",
                form = Project(form, currentUser, approverName)
            });
        }

        /// <summary>
        /// Reject with a mandatory reason. Returns the record to the originator.
        /// POST /api/self-evaluation/table-of-content/{id}/reject
        /// </summary>
        [HttpPost("{id:guid}/reject")]
        public async Task<IActionResult> Reject(Guid id, [FromBody] WorkflowActionRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var form = await _context.TableOfContents.FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            if (!RoleHierarchy.IsPending(form.ApprovalStatus))
                return SingleFieldFailure("status",
                    $"This record is '{form.ApprovalStatus}' and is not awaiting approval.", "Cannot reject");

            if (!IsCurrentApprover(form, currentUser))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "You are not the current approver of this record." });

            // Reason is mandatory.
            if (string.IsNullOrWhiteSpace(request?.Reason))
                return SingleFieldFailure("reason", "A rejection reason is required.", "Cannot reject");

            var previous = form.ApprovalStatus.ToString();
            var actor = CurrentActorName();

            form.ApprovalStatus = ApprovalStatus.Rejected;
            form.RejectionReason = request!.Reason!.Trim();
            form.CurrentApproverUserId = form.PreparedByUserId ?? form.SubmittedByUserId;
            form.DelegatedToUserId = null;
            form.DelegatedDate = null;
            form.DelegationReason = string.Empty;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor;

            AddAudit(WorkflowAction.Rejected, form.Id,
                     $"Rejected by {actor}. Reason: {form.RejectionReason}", previous, form.ApprovalStatus.ToString());

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Record rejected and returned to the originator.",
                form = Project(form, currentUser)
            });
        }

        /// <summary>
        /// Delegate the pending action to another user (reason recommended).
        /// POST /api/self-evaluation/table-of-content/{id}/delegate
        /// </summary>
        [HttpPost("{id:guid}/delegate")]
        public async Task<IActionResult> Delegate(Guid id, [FromBody] DelegateRequest? request)
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null) return Unauthorized(new { message = "Invalid session" });

            var form = await _context.TableOfContents.FirstOrDefaultAsync(t => t.Id == id);
            if (form is null) return NotFound(new { message = "Table of Content record not found" });

            if (!RoleHierarchy.IsPending(form.ApprovalStatus))
                return SingleFieldFailure("status",
                    $"This record is '{form.ApprovalStatus}' and cannot be delegated.", "Cannot delegate");

            if (!IsCurrentApprover(form, currentUser))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Only the current approver can delegate this record." });

            if (!RoleHierarchy.HasPermission(currentUser.Role, currentUser.AdditionalPermissions,
                                             currentUser.RevokedPermissions, Permissions.DelegateForm))
                return StatusCode(StatusCodes.Status403Forbidden,
                    new { message = "Your delegate privilege has been revoked." });

            if (!request?.DelegateToUserId.HasValue ?? true)
                return SingleFieldFailure("delegateToUserId", "Select the user to delegate to.", "Cannot delegate");

            var target = await _context.Users.FirstOrDefaultAsync(u =>
                u.Id == request!.DelegateToUserId!.Value && u.RecordStatus != RecordStatus.Deleted);

            if (target is null)
                return SingleFieldFailure("delegateToUserId", "The selected user does not exist.", "Cannot delegate");

            if (!target.IsActive)
                return SingleFieldFailure("delegateToUserId", $"'{target.FullName}' is inactive.", "Cannot delegate");

            if (target.Id == currentUser.Id)
                return SingleFieldFailure("delegateToUserId", "You cannot delegate to yourself.", "Cannot delegate");

            if (!RoleHierarchy.HasPermission(target.Role, target.AdditionalPermissions,
                                             target.RevokedPermissions, Permissions.ApproveForm))
                return SingleFieldFailure("delegateToUserId",
                    $"'{target.FullName}' does not hold the approve privilege.", "Cannot delegate");

            var previous = $"approver={form.CurrentApproverUserId}";
            var actor = CurrentActorName();

            form.DelegatedToUserId = target.Id;
            form.DelegatedDate = DateTime.UtcNow;
            form.DelegationReason = request!.Reason?.Trim() ?? string.Empty;
            form.CurrentApproverUserId = target.Id;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor;

            AddAudit(WorkflowAction.Delegated, form.Id,
                     $"Delegated by {actor} to {target.FullName} ({target.Role}). Reason: {form.DelegationReason}",
                     previous, $"approver={target.Id}");

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Delegated to '{target.FullName}'.",
                form = Project(form, currentUser, target.FullName)
            });
        }

        #endregion

        private static ComplianceStatus ParseCmmStatus(string? raw)
            => Enum.TryParse<ComplianceStatus>(raw, true, out var parsed) ? parsed : ComplianceStatus.NotReviewed;
    }

    // ===================== REQUEST DTOs =====================

    public class TableOfContentUpsertRequest
    {
        public Guid? ATARecordId { get; set; }
        public Guid? ShopId { get; set; }
        public string? FormNumber { get; set; }
        public string? RevisionNumber { get; set; }
        public DateTime? RevisionDate { get; set; }
        public string? Title { get; set; }
        public string? ATAChapterCode { get; set; }
        public string? ComponentPartNumber { get; set; }
        public string? ComponentDescription { get; set; }

        // CMM Status sub-section
        public string? CMMDocumentNumber { get; set; }
        public string? CMMRevision { get; set; }
        public DateTime? CMMRevisionDate { get; set; }
        public string? CMMPublisher { get; set; }
        public string? CMMStatus { get; set; }
        public string? CMMRemarks { get; set; }

        // Task Card list / Others list / full content items
        public string? TaskCardsJson { get; set; }
        public string? OtherDocumentsJson { get; set; }
        public string? ContentItemsJson { get; set; }

        // Signature block
        public string? PreparedBy { get; set; }
        public DateTime? PreparedDate { get; set; }
    }

    public class WorkflowActionRequest
    {
        public string? Comments { get; set; }

        /// <summary>Mandatory for reject.</summary>
        public string? Reason { get; set; }
    }

    public class DelegateRequest
    {
        public long? DelegateToUserId { get; set; }
        public string? Reason { get; set; }
    }
}