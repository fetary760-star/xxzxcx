using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Web.Api.SelfEvaluation.Extensions;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// =====================================================================================
    /// AMENDED v24 — ROLE-BASED APPROVAL WORKFLOW + DELEGATE AUTHORITY
    /// File: CMT.Web.Api.SelfEvaluation/Controllers/SelfEvaluation/ATARecordController.cs
    ///
    /// PRESERVED FROM v23: every actor assignment still uses `User.GetActorName()` so
    /// CreatedBy / UpdatedBy / SubmittedBy / ApprovedBy / RejectedBy / ReassignedBy
    /// capture the REAL person instead of "system".
    ///
    /// WHAT v24 ADDS:
    ///  1. ACTOR ROLE + ACTOR ID are stamped on every workflow command from the JWT
    ///     claims. The handler cannot enforce role-based routing without them, and they
    ///     are deliberately read from the TOKEN, never from the request body — a client
    ///     must not be able to claim a role it does not hold.
    ///  2. `POST {id}/confirm` — SCENARIO A. The Shop Team Leader confirms a record they
    ///     prepared; it is finalized immediately. The approval comment is OPTIONAL.
    ///  3. `POST {id}/return` — SCENARIO B. The Shop Team Leader sends the record back for
    ///     revision with MANDATORY comments; the record stays alive (previously this was
    ///     faked as a reject with a "RETURNED:" prefix, which killed the record).
    ///  4. Approve / Reject responses now distinguish "not allowed at your level" from
    ///     "not found", so a delegate whose grant expired gets a truthful 403 instead of
    ///     a misleading 404.
    /// =====================================================================================
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/ata-records")]
    [Authorize]
    public class ATARecordController : ControllerBase
    {
        private readonly IMediator _mediator;
        private readonly ApplicationDbContext _context;
        private readonly ICurrentUserAccessor _currentUser;

        public ATARecordController(
            IMediator mediator,
            ApplicationDbContext context,
            ICurrentUserAccessor currentUser)
        {
            _mediator = mediator;
            _context = context;
            _currentUser = currentUser;
        }

        // =================================================================================
        // ACTOR CONTEXT HELPERS  (read from the TOKEN, never from the body)
        // =================================================================================

        /// <summary>
        /// The caller's role as carried by the JWT. Any alias spelling is fine — the
        /// handler normalises it through RoleHierarchy.
        /// </summary>
        private string ActorRole()
            => User.FindFirst("role")?.Value
            ?? User.FindFirst(ClaimTypes.Role)?.Value
            ?? string.Empty;

        /// <summary>The caller's numeric user id (User.Id is long, never Guid).</summary>
        private long? ActorUserId()
        {
            var raw = User.FindFirst("userId")?.Value
                   ?? User.FindFirst("uid")?.Value
                   ?? User.FindFirst("sub")?.Value
                   ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            return long.TryParse(raw, out var parsed) ? parsed : null;
        }

        /// <summary>
        /// Get all ATA Records for a specific shop.
        /// </summary>
        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetATARecordsByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        /// <summary>
        /// Get a specific ATA Record by ID with all form submissions.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetATARecordByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        /// <summary>
        /// Create routing rows for a selected set of shops.
        /// </summary>
        [HttpPost("{id}/routing")]
        public async Task<IActionResult> Route(Guid id, [FromBody] RouteATARecordRequestDto request)
        {
            request ??= new RouteATARecordRequestDto();
            var record = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id && r.IsActive);

            if (record == null)
            {
                return NotFound(new { code = "ATA_RECORD_NOT_FOUND", message = "ATA record not found." });
            }

            var targets = new List<ShopRoutingTarget>();
            if (request.Targets is not null && request.Targets.Count > 0)
            {
                var distinctShopIds = request.Targets
                    .Where(t => t.ShopId != Guid.Empty)
                    .Select(t => t.ShopId)
                    .Distinct()
                    .ToList();

                var shops = await _context.Shops
                    .AsNoTracking()
                    .Where(s => distinctShopIds.Contains(s.Id))
                    .ToDictionaryAsync(s => s.Id, s => s);

                var leaderIds = shops.Values
                    .Where(s => s.TeamLeaderUserId.HasValue)
                    .Select(s => s.TeamLeaderUserId!.Value)
                    .Distinct()
                    .ToList();

                var leaders = await _context.Users
                    .AsNoTracking()
                    .Where(u => leaderIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u);

                foreach (var item in request.Targets.Where(t => t.ShopId != Guid.Empty))
                {
                    if (!shops.TryGetValue(item.ShopId, out var shop))
                    {
                        continue;
                    }

                    var leaderId = shop.TeamLeaderUserId;
                    var leader = leaderId.HasValue ? leaders.GetValueOrDefault(leaderId.Value) : null;

                    targets.Add(new ShopRoutingTarget
                    {
                        ShopId = shop.Id,
                        ShopName = shop.Name,
                        TeamLeaderUserId = leaderId,
                        TeamLeaderName = leader?.FullName ?? string.Empty,
                        IsTeamLeaderActive = leader is { IsActive: true },
                        IsPrimary = item.IsPrimary,
                    });
                }
            }

            var decision = EngineerRoutingPolicy.CanRoute(
                ActorRole(),
                User.Claims
                    .Where(c => c.Type == "permission" || c.Type == "permissions")
                    .Select(c => c.Value)
                    .ToList(),
                targets);

            if (!decision.Allowed)
            {
                return BadRequest(new
                {
                    code = decision.DenialCode,
                    message = decision.Message,
                    warnings = decision.Warnings
                });
            }

            var rows = EngineerRoutingPolicy.BuildRoutings(
                id,
                targets,
                ActorUserId() ?? 0,
                DateTime.UtcNow);

            if (rows.Count == 0)
            {
                return BadRequest(new
                {
                    code = "ENG_NO_TARGET_SHOPS",
                    message = "Select at least one target shop: an ATA record cannot be routed to nobody."
                });
            }

            var existing = await _context.ATARecordShopRoutings
                .Where(r => r.ATARecordId == id && r.IsActive)
                .ToListAsync();

            if (existing.Count > 0)
            {
                _context.ATARecordShopRoutings.RemoveRange(existing);
            }

            await _context.ATARecordShopRoutings.AddRangeAsync(rows);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                routings = rows.Select(MapRouting).ToList(),
                warnings = decision.Warnings ?? Array.Empty<string>()
            });
        }

        /// <summary>
        /// List routing rows for an ATA record.
        /// </summary>
        [HttpGet("{id}/routing")]
        public async Task<IActionResult> GetRouting(Guid id)
        {
            var rows = await _context.ATARecordShopRoutings
                .AsNoTracking()
                .Where(r => r.ATARecordId == id && r.IsActive)
                .OrderByDescending(r => r.RoutedAt)
                .ToListAsync();

            return Ok(rows.Select(MapRouting));
        }

        /// <summary>
        /// Returns the progress summary for the routing fan-out.
        /// </summary>
        [HttpGet("{id}/routing/progress")]
        public async Task<IActionResult> GetRoutingProgress(Guid id)
        {
            var rows = await _context.ATARecordShopRoutings
                .AsNoTracking()
                .Where(r => r.ATARecordId == id && r.IsActive)
                .ToListAsync();

            var (completed, total, text) = EngineerRoutingPolicy.ShopProgress(rows);
            return Ok(new
            {
                completed,
                total,
                text
            });
        }

        private static object MapRouting(ATARecordShopRouting routing)
        {
            return new
            {
                id = routing.Id,
                ataRecordId = routing.ATARecordId,
                targetShopId = routing.TargetShopId,
                targetShopName = routing.TargetShopName,
                isPrimaryTarget = routing.IsPrimaryTarget,
                resolvedTeamLeaderUserId = routing.ResolvedTeamLeaderUserId,
                resolvedTeamLeaderName = routing.ResolvedTeamLeaderName,
                hasActiveTeamLeader = routing.HasActiveTeamLeader,
                status = routing.Status,
                statusLabel = ApprovalStatusInfo.Label(routing.Status),
                routedAt = routing.RoutedAt,
                routedByUserId = routing.RoutedByUserId,
                isComplete = routing.IsComplete,
                isActive = routing.IsActive,
                acknowledgedAt = routing.AcknowledgedAt,
                acknowledgedByUserId = routing.AcknowledgedByUserId,
                completedAt = routing.CompletedAt,
                completedByUserId = routing.CompletedByUserId,
                notes = routing.Notes
            };
        }

        public sealed class RouteATARecordRequestDto
        {
            public List<RouteATARecordTargetDto> Targets { get; set; } = new();
            public string Notes { get; set; } = string.Empty;
        }

        public sealed class RouteATARecordTargetDto
        {
            public Guid ShopId { get; set; }
            public bool IsPrimary { get; set; }
        }

        /// <summary>
        /// Returns the current user's routing queue: only rows for the designated Shop
        /// Team Leader assigned to that target shop.
        /// </summary>
        [HttpGet("/api/self-evaluation/my-routings")]
        public async Task<IActionResult> GetMyRoutingQueue()
        {
            var userId = ActorUserId();
            if (!userId.HasValue)
            {
                return Unauthorized(new { code = "ATA_ACTOR_NOT_FOUND", message = "The authenticated user could not be resolved." });
            }

            var rows = await _context.ATARecordShopRoutings
                .AsNoTracking()
                .Where(r => r.IsActive && r.ResolvedTeamLeaderUserId == userId.Value)
                .OrderByDescending(r => r.RoutedAt)
                .ToListAsync();

            return Ok(rows.Select(MapRouting));
        }

        /// <summary>
        /// Acknowledge a shop routing row.
        /// </summary>
        [HttpPost("/api/self-evaluation/routing/{routingId}/acknowledge")]
        public async Task<IActionResult> AcknowledgeRouting(Guid routingId)
        {
            var row = await _context.ATARecordShopRoutings.FirstOrDefaultAsync(r => r.Id == routingId && r.IsActive);
            if (row == null)
            {
                return NotFound(new { code = "ATA_ROUTING_NOT_FOUND", message = "Routing row not found." });
            }

            var actorId = ActorUserId();
            if (!actorId.HasValue)
            {
                return Unauthorized(new { code = "ATA_ACTOR_NOT_FOUND", message = "The authenticated user could not be resolved." });
            }

            var decision = EngineerRoutingPolicy.CanActOnRouting(row, actorId.Value, ActorRole());
            if (!decision.Allowed)
            {
                return StatusCode(403, new { code = decision.DenialCode, message = decision.Message });
            }

            EngineerRoutingPolicy.AcknowledgeRouting(row, actorId.Value, DateTime.UtcNow);
            await _context.SaveChangesAsync();

            return Ok(MapRouting(row));
        }

        /// <summary>
        /// Mark a shop routing row complete.
        /// </summary>
        [HttpPost("/api/self-evaluation/routing/{routingId}/complete")]
        public async Task<IActionResult> CompleteRouting(Guid routingId, [FromBody] CompleteRoutingRequestDto? request)
        {
            var row = await _context.ATARecordShopRoutings.FirstOrDefaultAsync(r => r.Id == routingId && r.IsActive);
            if (row == null)
            {
                return NotFound(new { code = "ATA_ROUTING_NOT_FOUND", message = "Routing row not found." });
            }

            var actorId = ActorUserId();
            if (!actorId.HasValue)
            {
                return Unauthorized(new { code = "ATA_ACTOR_NOT_FOUND", message = "The authenticated user could not be resolved." });
            }

            var decision = EngineerRoutingPolicy.CanActOnRouting(row, actorId.Value, ActorRole());
            if (!decision.Allowed)
            {
                return StatusCode(403, new { code = decision.DenialCode, message = decision.Message });
            }

            EngineerRoutingPolicy.CompleteRouting(row, actorId.Value, DateTime.UtcNow, request?.Notes ?? string.Empty);
            await _context.SaveChangesAsync();

            return Ok(MapRouting(row));
        }

        public sealed class CompleteRoutingRequestDto
        {
            public string Notes { get; set; } = string.Empty;
        }

        /// <summary>
        /// Returns every frozen ATA signature line, including superseded lines.
        /// Storage locators never leave the API; the frontend receives only the
        /// authorized signature id and uses /api/signatures/{id}/file to render it.
        /// </summary>
        [HttpGet("{id}/signatures")]
        public async Task<IActionResult> GetSignatures(Guid id, CancellationToken cancellationToken)
        {
            var exists = await _context.ATARecords
                .AsNoTracking()
                .AnyAsync(r => r.Id == id && r.IsActive, cancellationToken);
            if (!exists) return NotFound();

            var signatures = await _context.ATARecordSignatures
                .AsNoTracking()
                .Where(s => s.ATARecordId == id)
                .OrderBy(s => s.StageOrder)
                .ThenBy(s => s.SignedAt)
                .Select(s => new
                {
                    s.Id,
                    s.StageOrder,
                    s.StageStatus,
                    s.ResultingStatus,
                    s.Block,
                    s.BlockCaption,
                    s.UserId,
                    s.PersonName,
                    s.PersonRole,
                    s.PersonRoleLabel,
                    s.SignedAt,
                    s.UserSignatureId,
                    s.SignatureFileName,
                    s.SignatureImageApplied,
                    s.ActionTaken,
                    s.Comments,
                    s.IsCurrent,
                    s.SupersededAt,
                    s.RecordRevisionNumber
                })
                .ToListAsync(cancellationToken);

            return Ok(signatures);
        }

        /// <summary>
        /// Get ATA Records for a specific component.
        /// </summary>
        [HttpGet("component/{componentId}")]
        public async Task<IActionResult> GetByComponent(Guid componentId)
        {
            var result = await _mediator.Send(new GetATARecordsByComponentQuery { ComponentId = componentId });
            return Ok(result);
        }

        /// <summary>
        /// Get ATA Records by approval status for a shop.
        /// </summary>
        [HttpGet("shop/{shopId}/status/{status}")]
        public async Task<IActionResult> GetByStatus(Guid shopId, int status)
        {
            var result = await _mediator.Send(new GetATARecordsByApprovalStatusQuery
            {
                ShopId = shopId,
                Status = (Domain.Models.Shared.ApprovalStatus)status
            });
            return Ok(result);
        }

        /// <summary>
        /// Get ATA Records pending the current user's approval.
        /// </summary>
        [HttpGet("pending-approval")]
        public async Task<IActionResult> GetPendingMyApproval()
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name ?? "";
            var userRole = ActorRole();

            var result = await _mediator.Send(new GetATARecordsPendingMyApprovalQuery
            {
                UserId = userId,
                UserRole = userRole
            });
            return Ok(result);
        }

        /// <summary>
        /// Create a new ATA Record (parent in the hierarchy).
        /// AMENDED v24: the preparer's role and id are frozen on the record so the
        /// workflow can distinguish a Shop-Team-Leader-prepared record (confirm-only)
        /// from an engineer- or delegate-prepared record (routes to the STL).
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateATARecordCommand command)
        {
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(command.Description)) missing.Add("Description");
            if (string.IsNullOrWhiteSpace(command.PartNumber)) missing.Add("PartNumber");
            if (string.IsNullOrWhiteSpace(command.Manufacturer)) missing.Add("Manufacturer");
            if (string.IsNullOrWhiteSpace(command.ATAChapterCode)) missing.Add("ATA");
            if (!command.SelfEvaluationDate.HasValue) missing.Add("SelfEvaluationDate");
            if (string.IsNullOrWhiteSpace(command.CMMRevDate)) missing.Add("CMMRevDate");
            if (string.IsNullOrWhiteSpace(command.RevNo)) missing.Add("RevNo");
            if (string.IsNullOrWhiteSpace(command.Authority)) missing.Add("Authority");
            if (string.IsNullOrWhiteSpace(command.ResponsibleWorkshop)) missing.Add("ResponsibleWorkshop");

            if (missing.Count > 0)
            {
                return BadRequest(new
                {
                    code = "ATA_REQUIRED_FIELDS_MISSING",
                    message = "Complete all required ATA Record fields.",
                    fields = missing
                });
            }

            command.CreatedBy = User.GetActorName();
            command.CreatedByUserId = ActorUserId();
            command.ActorRole = ActorRole();

            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        /// <summary>
        /// Update an existing ATA Record.
        /// AMENDED v24: the Shop Team Leader (and a live delegate) may edit the record
        /// directly while it is under review, per Scenario B.
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateATARecordCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            var result = await _mediator.Send(command);
            if (!result)
            {
                return BadRequest(new
                {
                    code = "ATA_EDIT_NOT_ALLOWED",
                    message = "Cannot edit this record at its current stage with your authority level."
                });
            }
            return NoContent();
        }

        /// <summary>
        /// Starts the next ATA revision. The handler validates the Shop Team Leader
        /// authority and resets the record plus all linked Table of Contents workflows.
        /// </summary>
        [HttpPost("{id}/start-revision")]
        public async Task<IActionResult> StartRevision(
            Guid id,
            [FromBody] StartATARecordRevisionCommand? command)
        {
            command ??= new StartATARecordRevisionCommand();
            command.Id = id;
            command.StartedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_REVISION_NOT_ALLOWED",
                    message = "Only the Shop Team Leader may start a revision of a completed record."
                });
            }

            return Ok(new { message = "Revision started" });
        }

        /// <summary>
        /// Delete (soft-delete) an ATA Record.
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var result = await _mediator.Send(new DeleteATARecordCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }

        /// <summary>
        /// Submit an ATA Record for approval.
        /// AMENDED v24: when the preparer is the Shop Team Leader the record has nobody to
        /// be submitted TO, so the handler finalizes it immediately (Scenario A).
        /// </summary>
        [HttpPost("{id}/submit")]
        public async Task<IActionResult> Submit(Guid id)
        {
            var result = await _mediator.Send(new SubmitATARecordForApprovalCommand
            {
                Id = id,
                SubmittedBy = User.GetActorName(),
                ActorRole = ActorRole(),
                ActorUserId = ActorUserId()
            });

            if (!result) return BadRequest(new { message = "Cannot submit. Record must be in Draft or Returned status." });
            return Ok(new { message = "Submitted for approval" });
        }

        /// <summary>
        /// Approve an ATA Record at the current approval level.
        /// AMENDED v24: `command.Comments` is the OPTIONAL approval comment. On a
        /// Shop-Team-Leader-prepared record this finalizes the record immediately.
        /// </summary>
        [HttpPost("{id}/approve")]
        public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveATARecordCommand command)
        {
            command.Id = id;
            command.ApprovedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_APPROVE_NOT_ALLOWED",
                    message = "You are not authorised to approve this record at its current stage."
                });
            }
            return Ok(new { message = "Approved" });
        }

        /// <summary>
        /// SCENARIO A — CONFIRM the record. Used when the Shop Team Leader created or
        /// amended it themselves: no Reject verb, an OPTIONAL comment, and the record is
        /// finalized immediately once confirmed.
        /// </summary>
        [HttpPost("{id}/confirm")]
        public async Task<IActionResult> Confirm(Guid id, [FromBody] ConfirmATARecordCommand command)
        {
            var currentUser = await _currentUser.GetAsync(HttpContext.RequestAborted);
            if (currentUser is null)
            {
                return Unauthorized(new
                {
                    code = "ATA_ACTOR_NOT_FOUND",
                    message = "The authenticated user could not be resolved."
                });
            }

            command ??= new ConfirmATARecordCommand();
            command.Id = id;
            command.ConfirmedBy = currentUser.FullName;
            command.ActorRole = currentUser.Role;
            command.ActorUserId = currentUser.Id;

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_CONFIRM_NOT_ALLOWED",
                    message = "You are not authorised to confirm this record, or it is already finalized."
                });
            }
            return Ok(new { message = "Confirmed" });
        }

        /// <summary>
        /// SCENARIO B — SEND BACK FOR REVISION. The record returns to the preparer and
        /// stays alive. Comments are MANDATORY.
        /// </summary>
        [HttpPost("{id}/return")]
        public async Task<IActionResult> ReturnForRevision(Guid id, [FromBody] ReturnATARecordForRevisionCommand command)
        {
            command ??= new ReturnATARecordForRevisionCommand();
            command.Id = id;
            command.ReturnedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            if (string.IsNullOrWhiteSpace(command.Comments))
            {
                return BadRequest(new
                {
                    code = "ATA_RETURN_COMMENTS_REQUIRED",
                    message = "Please explain what needs to be revised."
                });
            }

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_RETURN_NOT_ALLOWED",
                    message = "You are not authorised to return this record at its current stage."
                });
            }
            return Ok(new { message = "Returned for revision" });
        }

        /// <summary>
        /// Reject an ATA Record. Terminal; the reason is MANDATORY. Refused on a
        /// Shop-Team-Leader-prepared record — that path offers Confirm and amend instead.
        /// </summary>
        [HttpPost("{id}/reject")]
        public async Task<IActionResult> Reject(Guid id, [FromBody] RejectATARecordCommand command)
        {
            command.Id = id;
            command.RejectedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            if (string.IsNullOrWhiteSpace(command.Reason))
            {
                return BadRequest(new
                {
                    code = "ATA_REJECT_REASON_REQUIRED",
                    message = "Please provide a reason for rejection."
                });
            }

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_REJECT_NOT_ALLOWED",
                    message = "Rejection is not available for this record at your authority level."
                });
            }
            return Ok(new { message = "Rejected" });
        }

        /// <summary>
        /// Reassign / delegate an ATA Record to another user.
        /// AMENDED v24: the delegation now GRANTS AUTHORITY — a live ResponsibilityDelegation
        /// is persisted so the delegatee can view the Table of Contents and take workflow
        /// actions matching their delegated role level, not merely receive the row.
        /// </summary>
        [HttpPost("{id}/reassign")]
        public async Task<IActionResult> Reassign(Guid id, [FromBody] ReassignATARecordCommand command)
        {
            command.Id = id;
            command.ReassignedBy = User.GetActorName();
            command.ActorRole = ActorRole();
            command.ActorUserId = ActorUserId();

            var result = await _mediator.Send(command);
            if (!result)
            {
                return StatusCode(403, new
                {
                    code = "ATA_DELEGATE_NOT_ALLOWED",
                    message = "You are not authorised to delegate this record."
                });
            }
            return Ok(new { message = "Delegated" });
        }

        /// <summary>
        /// Store CMM revision data fetched from the external system.
        /// This endpoint does NOT require the record to be in Draft status.
        /// CMM data is reference/technical data that can be updated at any time.
        /// </summary>
        [HttpPost("{id}/store-cmm")]
        public async Task<IActionResult> StoreCMMData(Guid id, [FromBody] StoreCMMDataCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.GetActorName();
            var result = await _mediator.Send(command);
            if (!result) return NotFound(new { message = "ATA Record not found or inactive." });
            return Ok(new { message = "CMM data stored successfully." });
        }
    }
}