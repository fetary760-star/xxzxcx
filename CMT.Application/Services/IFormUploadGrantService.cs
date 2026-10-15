using System;
using System.Threading;
using System.Threading.Tasks;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED v13 - IFormUploadGrantService.cs   (NEW FILE)
    //
    // Admin-only administration of the FormUploadGrant entity: the explicit, time-boxed,
    // revocable privilege that lets a NON-Admin attach files to a form whose uploads are
    // locked by final approval / sign-off.
    //
    // Every refusal carries a structured AuthorizationDenialReason (the same enum the
    // upload authorization service uses) so the API returns 403 { code, message }.
    //
    // Policy enforced here (not in the controller):
    //   - actor MUST be an Admin (canonical or legacy spelling, via RoleHierarchy);
    //   - target user MUST exist and be active;
    //   - form MUST exist; a grant on an UNLOCKED form is pointless but allowed;
    //   - reason is MANDATORY (audit trail);
    //   - expiry is bounded: default 72h, maximum 7 days (a grant must never become a
    //     permanent hole in the completion lock);
    //   - re-granting the same (form, user) supersedes the previous active grant
    //     (old row deactivated, new row created) so the audit trail keeps both.
    // =====================================================================================

    public sealed class GrantUploadPrivilegeRequest
    {
        public Guid FormSubmissionId { get; set; }
        public long ForUserId { get; set; }
        public string Reason { get; set; } = string.Empty;
        public DateTime? ExpiresAt { get; set; }
    }

    public sealed class RevokeUploadGrantRequest
    {
        public Guid GrantId { get; set; }
        public string Reason { get; set; } = string.Empty;
    }

    public interface IFormUploadGrantService
    {
        /// <summary>Create a time-boxed upload privilege on a form. Admin only.</summary>
        Task<FormUploadGrant> GrantAsync(
            User adminUser,
            GrantUploadPrivilegeRequest request,
            CancellationToken cancellationToken = default);

        /// <summary>Revoke an active grant before its expiry. Admin only. Row kept for audit.</summary>
        Task<FormUploadGrant> RevokeAsync(
            User adminUser,
            RevokeUploadGrantRequest request,
            CancellationToken cancellationToken = default);

        /// <summary>Active grants for a form (admin audit view).</summary>
        Task<System.Collections.Generic.List<FormUploadGrant>> ListActiveForFormAsync(
            Guid formSubmissionId,
            CancellationToken cancellationToken = default);
    }
}