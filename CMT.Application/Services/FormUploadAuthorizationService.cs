using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED v13 - FormUploadAuthorizationService.cs   (NEW FILE)
    //
    // Implementation of the completion-lock rule:
    //
    //   1. Unknown / inactive user                     -> UserNotFound
    //   2. ATA-level attachment (no form)              -> Allowed (auth is enforced by
    //                                                     the controller's [Authorize])
    //   3. Form missing / soft-deleted                 -> FormNotFound
    //   4. Form NOT locked (UploadLock == Open)        -> Allowed (normal rules apply)
    //   5. Locked + actor is Admin                     -> Allowed (break-glass, flagged)
    //   6. Locked + active unexpired grant for actor   -> Allowed (expiry surfaced)
    //   7. Locked + no grant                           -> NoActiveGrant
    //   8. Locked + grant present but expired          -> GrantExpired
    //
    // Role comparison uses RoleHierarchy.Normalize so a canonical "Admin" and every
    // legacy spelling ("admin", "system_admin") all resolve identically - the same
    // disappearing-approver class of bug this amendment fixes elsewhere.
    // =====================================================================================
    public class FormUploadAuthorizationService : IFormUploadAuthorizationService
    {
        private readonly ApplicationDbContext _context;

        public FormUploadAuthorizationService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<UploadAuthorizationResult> AuthorizeUploadAsync(
            Guid? formSubmissionId,
            long userId,
            CancellationToken cancellationToken = default)
        {
            var user = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive, cancellationToken);

            if (user is null)
            {
                return UploadAuthorizationResult.Deny(
                    AuthorizationDenialReason.UserNotFound,
                    "The current user was not found or is inactive.");
            }

            // ATA-level attachment: no completed-form lock applies here.
            if (formSubmissionId is null)
            {
                return UploadAuthorizationResult.Allow();
            }

            var form = await _context.FormSubmissions
                .AsNoTracking()
                .FirstOrDefaultAsync(f => f.Id == formSubmissionId.Value && f.IsActive, cancellationToken);

            if (form is null)
            {
                return UploadAuthorizationResult.Deny(
                    AuthorizationDenialReason.FormNotFound,
                    "The form this attachment targets does not exist.");
            }

            // Not locked: the normal in-flight permission rules already checked by the
            // caller (authentication + form visibility) are sufficient.
            if (form.UploadLock != UploadLockState.LockedByCompletion)
            {
                return UploadAuthorizationResult.Allow();
            }

            // ---- LOCKED BY FINAL APPROVAL / SIGN-OFF ----

            var canonicalRole = RoleHierarchy.Normalize(user.Role);
            if (canonicalRole == OrgRoles.Admin)
            {
                return UploadAuthorizationResult.AllowByAdmin();
            }

            var grant = await _context.FormUploadGrants
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    g => g.FormSubmissionId == form.Id
                      && g.ForUserId == userId
                      && g.IsActive,
                    cancellationToken);

            if (grant is null)
            {
                return UploadAuthorizationResult.Deny(
                    AuthorizationDenialReason.NoActiveGrant,
                    "This form is completed and its uploads are locked. Ask an Admin to " +
                    "grant you a time-boxed upload privilege for this form.");
            }

            if (grant.ExpiresAt.HasValue && grant.ExpiresAt.Value.ToUniversalTime() <= DateTime.UtcNow)
            {
                return UploadAuthorizationResult.Deny(
                    AuthorizationDenialReason.GrantExpired,
                    "Your upload privilege for this completed form expired on " +
                    grant.ExpiresAt.Value.ToUniversalTime().ToString("u") +
                    ". Ask an Admin to issue a new grant.");
            }

            return UploadAuthorizationResult.AllowByGrant(grant.ExpiresAt);
        }
    }
}