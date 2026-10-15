using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.Models.Shared;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    /// <summary>
    /// Admin dashboard signature management.
    /// "On the admin role dashboard, provide a dedicated upload option for uploading
    ///  signature files (image or PDF)."
    /// </summary>
    [ApiController]
    [Route("api/admin/signatures")]
    [Authorize]
    public class AdminSignaturesController : ControllerBase
    {
        private readonly IUserSignatureService _signatures;
        private readonly ICurrentUserAccessor _currentUser;   // your existing accessor

        public AdminSignaturesController(
            IUserSignatureService signatures,
            ICurrentUserAccessor currentUser)
        {
            _signatures = signatures;
            _currentUser = currentUser;
        }

        /// <summary>GET /api/admin/signatures - coverage table for the dashboard.</summary>
        [HttpGet]
        public async Task<IActionResult> GetCoverage(
            [FromQuery] bool approverRolesOnly = false,
            CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null) return Unauthorized();

            var rows = await _signatures.GetCoverageAsync(me, approverRolesOnly, cancellationToken);
            return Ok(rows);
        }

        /// <summary>GET /api/admin/signatures/user/{userId} - version history.</summary>
        [HttpGet("user/{userId:long}")]
        public async Task<IActionResult> GetHistory(
            long userId, CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null) return Unauthorized();

            // A user may always inspect their own specimen; Admin may inspect anyone's.
            if (me.Id != userId && RoleHierarchy.Normalize(me.Role) != OrgRoles.Admin)
                return Forbid();

            return Ok(await _signatures.GetHistoryAsync(userId, cancellationToken));
        }

        /// <summary>
        /// POST /api/admin/signatures   (multipart/form-data)
        ///   file    : IFormFile  - PNG / JPEG / WEBP / PDF
        ///   userId  : long       - the owner
        ///   remarks : string?    - optional note
        /// </summary>
        [HttpPost]
        [RequestSizeLimit(4 * 1024 * 1024)]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> Upload(
            IFormFile file,
            [FromForm] long userId,
            [FromForm] string? remarks,
            CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null) return Unauthorized();

            if (RoleHierarchy.Normalize(me.Role) != OrgRoles.Admin)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    errorCode = SignatureErrorCodes.AdminOnly,
                    message = "Only an Admin may upload signature specimens."
                });
            }

            if (file is null || file.Length == 0)
            {
                return BadRequest(new
                {
                    errorCode = SignatureErrorCodes.FileMissing,
                    message = "Select a signature image or PDF to upload."
                });
            }

            await using var stream = file.OpenReadStream();

            var result = await _signatures.UploadAsync(
                me, userId, stream, file.FileName, file.ContentType, file.Length,
                remarks, cancellationToken);

            if (!result.Success)
                return BadRequest(new { errorCode = result.ErrorCode, message = result.Message });

            return Ok(result.Data);
        }

        /// <summary>
        /// GET /api/admin/signatures/{id}/file - authorised streaming.
        /// The raw StoragePath is NEVER returned by any endpoint.
        /// </summary>
        [HttpGet("{id:guid}/file")]
        public async Task<IActionResult> GetFile(
            Guid id, CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null) return Unauthorized();

            var opened = await _signatures.OpenFileAsync(id, cancellationToken);
            if (opened is null) return NotFound();

            var (content, contentType, fileName) = opened.Value;

            // Never cached by shared proxies.
            Response.Headers["Cache-Control"] = "private, no-store";
            return File(content, contentType, fileName);
        }

        /// <summary>DELETE /api/admin/signatures/{id} - revoke.</summary>
        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> Revoke(
            Guid id,
            [FromQuery] string? reason,
            CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null) return Unauthorized();

            var result = await _signatures.RevokeAsync(me, id, reason, cancellationToken);
            if (!result.Success)
                return BadRequest(new { errorCode = result.ErrorCode, message = result.Message });

            return NoContent();
        }
    }
}