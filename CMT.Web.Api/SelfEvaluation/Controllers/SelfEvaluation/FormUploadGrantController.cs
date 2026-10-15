using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// AMENDED v13 - Admin-only administration of the completion upload lock.
    ///
    ///   POST   api/self-evaluation/forms/{formId}/upload-grants   grant (Admin only)
    ///   GET    api/self-evaluation/forms/{formId}/upload-grants   active grants
    ///   DELETE api/self-evaluation/upload-grants/{grantId}        revoke (Admin only)
    ///
    /// The Admin requirement, the mandatory reason, the expiry cap and the audit trail
    /// are all enforced inside IFormUploadGrantService; refusals surface as
    /// AuthorizationDeniedException and become 403 { code, message } via the global
    /// middleware in Program.cs.
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation")]
    [Authorize]
    public class FormUploadGrantController : ControllerBase
    {
        private readonly ICurrentUserAccessor _currentUser;
        private readonly IFormUploadGrantService _grants;

        public FormUploadGrantController(
            ICurrentUserAccessor currentUser,
            IFormUploadGrantService grants)
        {
            _currentUser = currentUser;
            _grants = grants;
        }

        private async Task<(CMT.Domain.Models.SelfEvaluation.User? user, IActionResult? failure)> RequireUserAsync()
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

        /// <summary>Grant a time-boxed upload privilege for a completed form. Admin only.</summary>
        [HttpPost("forms/{formId:guid}/upload-grants")]
        public async Task<IActionResult> Grant(Guid formId, [FromBody] GrantUploadPrivilegeRequest body)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            body.FormSubmissionId = formId;
            var grant = await _grants.GrantAsync(user!, body, HttpContext.RequestAborted);
            return Ok(Map(grant));
        }

        /// <summary>List the active upload grants of a form (audit view).</summary>
        [HttpGet("forms/{formId:guid}/upload-grants")]
        public async Task<IActionResult> ListForForm(Guid formId)
        {
            var (_, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var grants = await _grants.ListActiveForFormAsync(formId, HttpContext.RequestAborted);
            return Ok(grants.MapAll());
        }

        /// <summary>Revoke an upload grant before its expiry. Admin only.</summary>
        [HttpDelete("upload-grants/{grantId:guid}")]
        public async Task<IActionResult> Revoke(Guid grantId, [FromBody] RevokeUploadGrantRequest body)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            body.GrantId = grantId;
            var grant = await _grants.RevokeAsync(user!, body, HttpContext.RequestAborted);
            return Ok(Map(grant));
        }

        private static object Map(FormUploadGrant g) => new
        {
            id = g.Id,
            formSubmissionId = g.FormSubmissionId,
            forUserId = g.ForUserId,
            forUserName = g.ForUserName,
            grantedByUserId = g.GrantedByUserId,
            grantedByName = g.GrantedByName,
            reason = g.Reason,
            expiresAt = g.ExpiresAt,
            isActive = g.IsActive,
            createdAt = g.CreatedAt
        };
    }

    internal static class FormUploadGrantMappingExtensions
    {
        public static object MapAll(this System.Collections.Generic.IEnumerable<FormUploadGrant> grants)
        {
            var list = new System.Collections.Generic.List<object>();
            foreach (var g in grants)
            {
                list.Add(new
                {
                    id = g.Id,
                    formSubmissionId = g.FormSubmissionId,
                    forUserId = g.ForUserId,
                    forUserName = g.ForUserName,
                    grantedByUserId = g.GrantedByUserId,
                    grantedByName = g.GrantedByName,
                    reason = g.Reason,
                    expiresAt = g.ExpiresAt,
                    isActive = g.IsActive,
                    createdAt = g.CreatedAt
                });
            }
            return list;
        }
    }
}
