using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED v13 - FormUploadGrantService.cs   (NEW FILE)
    //
    // Implementation of the Admin-only grant / revoke administration of the
    // completion upload lock. See IFormUploadGrantService for the policy summary.
    // =====================================================================================
    public class FormUploadGrantService : IFormUploadGrantService
    {
        // A grant must never become a permanent hole in the completion lock.
        public static readonly TimeSpan DefaultGrantWindow = TimeSpan.FromHours(72);
        public static readonly TimeSpan MaximumGrantWindow = TimeSpan.FromDays(7);

        private readonly ApplicationDbContext _context;

        public FormUploadGrantService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<FormUploadGrant> GrantAsync(
            User adminUser,
            GrantUploadPrivilegeRequest request,
            CancellationToken cancellationToken = default)
        {
            RequireAdmin(adminUser);

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.AdminOnly,
                    "A reason is mandatory for every upload privilege grant (audit trail).");
            }

            var form = await _context.FormSubmissions
                .FirstOrDefaultAsync(f => f.Id == request.FormSubmissionId && f.IsActive, cancellationToken);
            if (form is null)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound,
                    "The form to grant an upload privilege on does not exist.");
            }

            var target = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == request.ForUserId && u.IsActive, cancellationToken);
            if (target is null)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.UserNotFound,
                    "The target user does not exist or is inactive.");
            }

            // ---- expiry policy: default 72h, hard cap 7 days from now ----
            var nowUtc = DateTime.UtcNow;
            DateTime expiresAt;
            if (request.ExpiresAt.HasValue)
            {
                var requested = request.ExpiresAt.Value.ToUniversalTime();
                var maxAllowed = nowUtc + MaximumGrantWindow;
                if (requested <= nowUtc)
                {
                    throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.GrantExpired,
                        "The requested expiry is already in the past.");
                }
                expiresAt = requested > maxAllowed ? maxAllowed : requested;
            }
            else
            {
                expiresAt = nowUtc + DefaultGrantWindow;
            }

            // Supersede any previous active grant for the same (form, user): the old
            // row is deactivated (kept for audit), a fresh row is created.
            var stale = await _context.FormUploadGrants
                .Where(g => g.FormSubmissionId == form.Id
                         && g.ForUserId == target.Id
                         && g.IsActive)
                .ToListAsync(cancellationToken);

            foreach (var g in stale)
            {
                g.IsActive = false;
            }

            var grant = new FormUploadGrant
            {
                Id = Guid.NewGuid(),
                FormSubmissionId = form.Id,
                ForUserId = target.Id,
                ForUserName = string.IsNullOrWhiteSpace(target.FullName) ? target.Username : target.FullName,
                GrantedByUserId = adminUser.Id,
                GrantedByName = string.IsNullOrWhiteSpace(adminUser.FullName) ? adminUser.Username : adminUser.FullName,
                Reason = request.Reason.Trim(),
                ExpiresAt = expiresAt,
                IsActive = true,
                CreatedAt = nowUtc,
                CreatedBy = adminUser.Username
            };

            _context.FormUploadGrants.Add(grant);

            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = "Upload privilege GRANTED",
                WorkflowAction = WorkflowAction.Updated,
                EntityType = "FormUploadGrant",
                EntityId = grant.Id,
                PerformedBy = adminUser.Username,
                Details = $"Form {form.FormType} ({form.Id}) -> user {grant.ForUserName} ({grant.ForUserId}); " +
                          $"expires {expiresAt:u}; reason: {grant.Reason}",
                Timestamp = nowUtc
            });

            await _context.SaveChangesAsync(cancellationToken);
            return grant;
        }

        public async Task<FormUploadGrant> RevokeAsync(
            User adminUser,
            RevokeUploadGrantRequest request,
            CancellationToken cancellationToken = default)
        {
            RequireAdmin(adminUser);

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.AdminOnly,
                    "A reason is mandatory when revoking an upload privilege (audit trail).");
            }

            var grant = await _context.FormUploadGrants
                .FirstOrDefaultAsync(g => g.Id == request.GrantId, cancellationToken);
            if (grant is null)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NoActiveGrant,
                    "The upload grant to revoke does not exist.");
            }

            if (!grant.IsActive)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NoActiveGrant,
                    "The upload grant is already revoked or superseded.");
            }

            grant.IsActive = false;

            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = "Upload privilege REVOKED",
                WorkflowAction = WorkflowAction.Updated,
                EntityType = "FormUploadGrant",
                EntityId = grant.Id,
                PerformedBy = adminUser.Username,
                Details = $"Grant for user {grant.ForUserName} ({grant.ForUserId}) on form {grant.FormSubmissionId}; " +
                          $"reason: {request.Reason.Trim()}",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync(cancellationToken);
            return grant;
        }

        public async Task<List<FormUploadGrant>> ListActiveForFormAsync(
            Guid formSubmissionId,
            CancellationToken cancellationToken = default)
        {
            var nowUtc = DateTime.UtcNow;
            return await _context.FormUploadGrants
                .AsNoTracking()
                .Where(g => g.FormSubmissionId == formSubmissionId
                         && g.IsActive
                         && (g.ExpiresAt == null || g.ExpiresAt > nowUtc))
                .OrderByDescending(g => g.CreatedAt)
                .ToListAsync(cancellationToken);
        }

        private static void RequireAdmin(User actor)
        {
            var canonical = RoleHierarchy.Normalize(actor?.Role);
            if (canonical != OrgRoles.Admin)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.AdminOnly,
                    "Only an Admin may grant or revoke upload privileges on a completed form.");
            }
        }
    }
}