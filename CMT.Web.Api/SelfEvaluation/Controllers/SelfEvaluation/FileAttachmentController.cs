using System;
using System.IO;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Application.SelfEvaluation.Services;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// AMENDED v13: the upload endpoint now resolves the NUMERIC authenticated user id
    /// (never a display name) and runs the full upload-lock / grant / Admin authorization
    /// BEFORE a single byte is written to disk. Denials return 403 with a structured
    /// { code, message } payload instead of an ambiguous 400/404.
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/files")]
    [Authorize]
    public class FileAttachmentController : ControllerBase
    {
        private readonly IMediator _mediator;
        private readonly ICurrentUserAccessor _currentUser;
        private readonly IFormUploadAuthorizationService _uploadAuth;
        private readonly string _uploadBasePath;

        public FileAttachmentController(
            IMediator mediator,
            ICurrentUserAccessor currentUser,
            IFormUploadAuthorizationService uploadAuth,
            IConfiguration configuration)
        {
            _mediator = mediator;
            _currentUser = currentUser;
            _uploadAuth = uploadAuth;
            _uploadBasePath = configuration["FileStorage:BasePath"] ?? "uploads/self-evaluation";
        }

        /// <summary>
        /// Get all file attachments for an ATA Record.
        /// </summary>
        [HttpGet("ata-record/{ataRecordId}")]
        public async Task<IActionResult> GetByATARecord(Guid ataRecordId)
        {
            var result = await _mediator.Send(new GetFileAttachmentsByATARecordQuery { ATARecordId = ataRecordId });
            return Ok(result);
        }

        /// <summary>
        /// Get all file attachments for a form submission.
        /// </summary>
        [HttpGet("form/{formSubmissionId}")]
        public async Task<IActionResult> GetByForm(Guid formSubmissionId)
        {
            var result = await _mediator.Send(new GetFileAttachmentsByFormQuery { FormSubmissionId = formSubmissionId });
            return Ok(result);
        }

        /// <summary>
        /// Upload a file to an ATA Record or Form Submission.
        /// </summary>
        [HttpPost("upload")]
        [RequestSizeLimit(50 * 1024 * 1024)] // 50MB limit
        public async Task<IActionResult> Upload(
            IFormFile file,
            [FromForm] Guid? ataRecordId,
            [FromForm] Guid? formSubmissionId,
            [FromForm] string? formType,
            [FromForm] string? description)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided" });

            if (ataRecordId == null && formSubmissionId == null)
                return BadRequest(new { message = "Either ataRecordId or formSubmissionId must be provided" });

            // ---- AMENDED v13: reliable numeric identity, then authorization ----
            var user = await _currentUser.GetAsync(HttpContext.RequestAborted);
            if (user is null)
            {
                return Unauthorized(new
                {
                    code = nameof(AuthorizationDenialReason.NotAuthenticated),
                    message = "The authenticated user could not be resolved."
                });
            }

            var auth = await _uploadAuth.AuthorizeUploadAsync(
                formSubmissionId, user.Id, HttpContext.RequestAborted);

            if (!auth.Allowed)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    code = auth.Reason.ToString(),
                    message = auth.Message,
                    grantExpiresAt = auth.GrantExpiresAt
                });
            }

            // ---- authorization passed: only NOW the bytes are written ----
            var fileName = $"{Guid.NewGuid()}_{Path.GetFileName(file.FileName)}";
            var relativePath = Path.Combine(_uploadBasePath, DateTime.UtcNow.ToString("yyyy/MM"), fileName);
            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), relativePath);

            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

            using (var stream = new FileStream(fullPath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var id = await _mediator.Send(new CreateFileAttachmentCommand
            {
                ATARecordId = ataRecordId,
                FormSubmissionId = formSubmissionId,
                FileName = file.FileName,
                ContentType = file.ContentType,
                FileSizeBytes = file.Length,
                StoragePath = relativePath,
                Description = description ?? string.Empty,
                FormType = formType ?? string.Empty,
                UploadedBy = user.FullName,
                ActorUserId = user.Id
            });

            return Ok(new
            {
                id,
                fileName = file.FileName,
                storagePath = relativePath,
                adminBreakGlass = auth.AdminBreakGlass,
                grantExpiresAt = auth.GrantExpiresAt
            });
        }

        /// <summary>
        /// Download a file by ID.
        /// </summary>
        [HttpGet("{id}/download")]
        public async Task<IActionResult> Download(Guid id)
        {
            // Get file info from database
            var files = await _mediator.Send(new GetFileAttachmentsByATARecordQuery { ATARecordId = Guid.Empty });
            // In production, query by ID directly - simplified here
            return NotFound(); // Placeholder - implement with proper file retrieval
        }

        /// <summary>
        /// Delete a file attachment.
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var result = await _mediator.Send(new DeleteFileAttachmentCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }

        /// <summary>
        /// Approve a file attachment.
        /// </summary>
        [HttpPost("{id}/approve")]
        public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveFileAttachmentCommand command)
        {
            command.Id = id;
            command.ApprovedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return Ok(new { message = "File approved" });
        }

        /// <summary>
        /// Reject a file attachment.
        /// </summary>
        [HttpPost("{id}/reject")]
        public async Task<IActionResult> Reject(Guid id, [FromBody] RejectFileAttachmentCommand command)
        {
            command.Id = id;
            command.RejectedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return Ok(new { message = "File rejected" });
        }
    }
}