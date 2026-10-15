using System;
using System.Threading.Tasks;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.Shared;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// AMENDED v13: every workflow action now carries the NUMERIC authenticated user id
    /// (User.Id) resolved through ICurrentUserAccessor, so the handlers authorize against
    /// a reliable identity instead of User.Identity.Name. AuthorizationDeniedException
    /// thrown by the handlers is translated into 403 { code, message } by the global
    /// middleware registered in Program.cs.
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/forms")]
    [Authorize]
    public class FormSubmissionController : ControllerBase
    {
        private readonly IMediator _mediator;
        private readonly ICurrentUserAccessor _currentUser;
        private readonly ApplicationDbContext _context;

        public FormSubmissionController(
            IMediator mediator,
            ICurrentUserAccessor currentUser,
            ApplicationDbContext context)
        {
            _mediator = mediator;
            _currentUser = currentUser;
            _context = context;
        }

        private async Task<(User? user, IActionResult? failure)> RequireUserAsync()
        {
            var user = await _currentUser.GetAsync(HttpContext.RequestAborted);
            if (user is null)
            {
                return (null, Unauthorized(new
                {
                    code = nameof(AuthorizationDenialReason.NotAuthenticated),
                    message = "The authenticated user could not be resolved."
                }));
            }
            return (user, null);
        }

        /// <summary>
        /// Get all form submissions for an ATA Record.
        /// </summary>
        [HttpGet("ata-record/{ataRecordId}")]
        public async Task<IActionResult> GetByATARecord(Guid ataRecordId)
        {
            var result = await _mediator.Send(new GetFormSubmissionsByATARecordQuery { ATARecordId = ataRecordId });
            return Ok(result);
        }

        /// <summary>
        /// Get a specific form submission by ID.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetFormSubmissionByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        /// <summary>
        /// Get a form submission by type for a specific ATA Record.
        /// Returns the latest revision. 204 when the form does not exist yet.
        /// </summary>
        [HttpGet("ata-record/{ataRecordId}/type/{formType}")]
        public async Task<IActionResult> GetByType(Guid ataRecordId, string formType)
        {
            var result = await _mediator.Send(new GetFormSubmissionByTypeQuery
            {
                ATARecordId = ataRecordId,
                FormType = formType
            });
            if (result == null) return NoContent();
            return Ok(result);
        }

        [HttpGet("approved-training")]
        public async Task<IActionResult> GetApprovedTraining(
            [FromQuery] Guid ataRecordId,
            [FromQuery] string formType,
            [FromQuery] string employeeId)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var actorRole = RoleHierarchy.Normalize(user!.Role);
            if (actorRole != OrgRoles.TeamLeader)
                return Forbid();

            var ata = await _mediator.Send(new GetATARecordByIdQuery { Id = ataRecordId });
            if (ata is null || ata.ShopId != user.ShopId)
                return Forbid();

            var forms = await _context.FormSubmissions
                .AsNoTracking()
                .Where(form => (form.ShopId == user.ShopId
                        || _context.ATARecords.Any(record => record.Id == form.ATARecordId
                            && record.ShopId == user.ShopId))
                    && form.FormType == formType
                    && form.IsActive
                    && (form.ApprovalStatus == ApprovalStatus.Approved
                        || form.ApprovalStatus == ApprovalStatus.Completed
                        || form.ApprovalStatus == ApprovalStatus.Locked))
                .OrderByDescending(form => form.ApprovedDate ?? form.UpdatedAt)
                .ToListAsync(HttpContext.RequestAborted);

            var matches = forms.Where(form => string.Equals(
                    EmployeeIdFromJson(form.FormDataJson), employeeId, StringComparison.OrdinalIgnoreCase))
                .Select(form => new
                {
                    id = form.Id,
                    formType = form.FormType,
                    formNo = form.FormNo,
                    approvedDate = form.ApprovedDate,
                    sourceAtaRecordId = form.ATARecordId,
                    sourceFormSubmissionId = form.SourceFormSubmissionId
                });
            return Ok(matches);
        }

        [HttpPost("include-approved-training")]
        public async Task<IActionResult> IncludeApprovedTraining(
            [FromBody] IncludeApprovedTrainingFormCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.ActorUserId = user!.Id;
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        private static string EmployeeIdFromJson(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return string.Empty;
            try
            {
                using var document = JsonDocument.Parse(json);
                if (!document.RootElement.TryGetProperty("assignedEmployeeId", out var assigned))
                    return string.Empty;
                return assigned.ValueKind == JsonValueKind.String
                    ? assigned.GetString() ?? string.Empty
                    : assigned.ToString();
            }
            catch (JsonException)
            {
                return string.Empty;
            }
        }

        /// <summary>
        /// Get all forms pending the current user's approval.
        /// AMENDED v13: the numeric id + persisted role are handed to the query so the
        /// handler can prioritise CurrentApproverUserId / delegation assignment.
        /// </summary>
        [HttpGet("pending-approval")]
        public async Task<IActionResult> GetPendingMyApproval()
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var result = await _mediator.Send(new GetFormSubmissionsPendingMyApprovalQuery
            {
                UserId = user!.Id.ToString(),
                UserRole = user.Role
            });
            return Ok(result);
        }

        /// <summary>
        /// Create a new form submission.
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateFormSubmissionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.CreatedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        /// <summary>
        /// Update an existing form submission.
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFormSubmissionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.Id = id;
            command.UpdatedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var result = await _mediator.Send(command);
            if (!result) return BadRequest(new { message = "Cannot update. Form must be in Draft or Returned status." });
            return NoContent();
        }

        /// <summary>
        /// Delete (soft-delete) a form submission.
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var result = await _mediator.Send(new DeleteFormSubmissionCommand { Id = id, ActorUserId = user!.Id });
            if (!result) return NotFound();
            return NoContent();
        }

        /// <summary>
        /// Submit a form for approval.
        /// </summary>
        [HttpPost("{id}/submit")]
        public async Task<IActionResult> Submit(Guid id)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var result = await _mediator.Send(new SubmitFormForApprovalCommand
            {
                Id = id,
                SubmittedBy = user!.FullName,
                ActorUserId = user.Id
            });
            if (!result) return BadRequest(new { message = "Cannot submit. Form must be in Draft or Returned status." });
            return Ok(new { message = "Submitted for approval" });
        }

        /// <summary>
        /// Approve a form submission at the current step.
        /// </summary>
        [HttpPost("{id}/approve")]
        public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveFormSubmissionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.Id = id;
            command.ApprovedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var result = await _mediator.Send(command);
            if (!result) return BadRequest(new { message = "Cannot approve at current status." });
            return Ok(new { message = "Approved" });
        }

        /// <summary>
        /// Reject a form submission.
        /// </summary>
        [HttpPost("{id}/reject")]
        public async Task<IActionResult> Reject(Guid id, [FromBody] RejectFormSubmissionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.Id = id;
            command.RejectedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return Ok(new { message = "Rejected" });
        }

        /// <summary>
        /// Delegate a form to another user.
        /// </summary>
        [HttpPost("{id}/delegate")]
        public async Task<IActionResult> Delegate(Guid id, [FromBody] DelegateFormSubmissionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.Id = id;
            command.DelegatedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return Ok(new { message = "Delegated" });
        }

        /// <summary>
        /// Return a form for revision.
        /// </summary>
        [HttpPost("{id}/return")]
        public async Task<IActionResult> ReturnForRevision(Guid id, [FromBody] ReturnFormForRevisionCommand command)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            command.Id = id;
            command.ReturnedBy = user!.FullName;
            command.ActorUserId = user.Id;
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return Ok(new { message = "Returned for revision" });
        }
    }
}