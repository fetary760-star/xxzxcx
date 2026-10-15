/*
 * =====================================================================================
 * AMENDED v29 — PHASE 1 / DELIVERABLE 3 (NEW FILE): THE READ-ONLY SPECIMEN SERVICE IMPL
 * Copy to: CMT.Application.SelfEvaluation/Services/SignatureReadService.cs
 *
 * WHAT IT DOES
 * ------------
 * Implements `ISignatureReadService` by COMPOSING the service you already own:
 *   - `IUserSignatureService.GetActiveAsync(userId)`   — the active-row query, unchanged;
 *   - `IUserSignatureService.OpenFileAsync(id)`        — the byte stream, unchanged;
 *   - `HierarchyRuleService.GetVisibleUserIdsAsync`    — the SAME visibility predicate the
 *                                                       coverage table uses, so the UI and
 *                                                       this guard can never disagree.
 * NOTHING in `UserSignatureService.cs` / `IUserSignatureService.cs` is modified.
 *
 * THE ONE QUERY THIS SERVICE OWNS
 * -------------------------------
 * `FormSignatures` is consulted to answer "is this user already a recorded signer?". That row
 * set is written exclusively by `UserSignatureService.StampAsync` (`line.UserId = signer.Id`),
 * so its presence is proof that the specimen is ALREADY printed on a controlled form. This is
 * grant 3 (RecordedSigner) and it is what keeps an executed MNT-1229B approval block visible
 * to every reader of the folder.
 *
 * PERFORMANCE NOTE (it matters here)
 * ---------------------------------
 * A folder PDF preview renders ~11 forms with up to 3 signature lines each. Every printed cell
 * calls `resolveSignature(userId)` on the client, but `signature-render.ts` caches ONE promise
 * and ONE object URL PER USER for the lifetime of the page, so this service sees at most one
 * `active` request per distinct signer. The two queries below are therefore executed a handful
 * of times per page, both `AsNoTracking`, both indexed on `UserId`. No caching is added here on
 * purpose: a specimen revoked by an Admin must stop being served on the very next request.
 *
 * FOUR HARD RULES (mirrored from the interface)
 *   (1) A MISSING SPECIMEN IS NOT AN ERROR -> `SignatureViewResult.NoSpecimen` -> 204.
 *   (2) NO STORAGE LOCATOR LEAVES THIS CLASS. `ToActiveResponse` copies seven fields and
 *       builds `FileUrl` from `SignatureReadRoutes.FileUrlOf` — the NON-ADMIN route, because
 *       the reader is an approver, not an Admin.
 *   (3) READ-ONLY. No mutation, no `SaveChangesAsync`, no audit row.
 *   (4) THE FILE ENDPOINT RE-CHECKS THE OWNER before opening a single byte.
 * =====================================================================================
 */

using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Default implementation of the non-admin specimen read surface.
    /// See the file header for the full view policy and its rationale.
    /// </summary>
    public class SignatureReadService : ISignatureReadService
    {
        private readonly ApplicationDbContext _context;
        private readonly IUserSignatureService _signatures;
        private readonly HierarchyRuleService _hierarchy;
        private readonly ILogger<SignatureReadService> _logger;

        public SignatureReadService(
            ApplicationDbContext context,
            IUserSignatureService signatures,
            HierarchyRuleService hierarchy,
            ILogger<SignatureReadService> logger)
        {
            _context = context;
            _signatures = signatures;
            _hierarchy = hierarchy;
            _logger = logger;
        }

        // =================================================================================
        // 1. THE VIEW POLICY
        // =================================================================================

        /// <summary>
        /// Grants in precedence order: Self, Admin, RecordedSigner, HierarchyScope, Denied.
        ///
        /// The order is not cosmetic. Self is first because it is the hot path of the v28
        /// provisional fill (a form with NO workflow instance, opened by its preparer), and it
        /// must never pay for a hierarchy query. Admin is second because it must not be
        /// weakened by a later, narrower rule.
        /// </summary>
        public async Task<SignatureViewGrant> ResolveGrantAsync(
            User caller,
            long targetUserId,
            CancellationToken cancellationToken = default)
        {
            if (caller is null || targetUserId <= 0) return SignatureViewGrant.Denied;

            // ---- GRANT 1: SELF -------------------------------------------------------------
            // The logged-in user rendering his OWN "prepared By:" / "Approved by:" line.
            if (caller.Id == targetUserId) return SignatureViewGrant.Self;

            // ---- GRANT 2: ADMIN ------------------------------------------------------------
            var callerRole = RoleHierarchy.Normalize(caller.Role) ?? caller.Role;
            if (string.Equals(callerRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
                return SignatureViewGrant.Admin;

            // ---- GRANT 3: RECORDED SIGNER --------------------------------------------------
            // Written only by StampAsync, so its presence means the specimen is already printed
            // on a controlled form. Blanking it would erase an executed approval block.
            var isRecordedSigner = await _context.FormSignatures
                .AsNoTracking()
                .AnyAsync(s => s.UserId == targetUserId, cancellationToken);

            if (isRecordedSigner) return SignatureViewGrant.RecordedSigner;

            // ---- GRANT 4: HIERARCHY SCOPE + APPROVER ROLE ---------------------------------
            // The pre-approval preview: an STL previewing the MGR line of MNT-1229B before the
            // Manager has acted. Restricted twice over — the target must be inside the caller's
            // visible scope AND must actually sign at least one form.
            var target = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    u => u.Id == targetUserId && u.RecordStatus != RecordStatus.Deleted,
                    cancellationToken);

            if (target is null) return SignatureViewGrant.Denied;

            var visible = await _hierarchy.GetVisibleUserIdsAsync(caller, cancellationToken);
            if (visible is null || !visible.Contains(targetUserId)) return SignatureViewGrant.Denied;

            var targetRole = RoleHierarchy.Normalize(target.Role) ?? target.Role;
            if (string.IsNullOrWhiteSpace(targetRole)) return SignatureViewGrant.Denied;

            // Admin is a librarian, not a signatory: an Admin specimen is never printed on a
            // form, so there is no legitimate reason for a non-admin to stream it.
            if (string.Equals(targetRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
                return SignatureViewGrant.Denied;

            return SignatureViewGrant.HierarchyScope;
        }

        // =================================================================================
        // 2. GET /api/signatures/user/{userId}/active
        // =================================================================================

        public async Task<SignatureViewResult> TryGetActiveAsync(
            User caller,
            long targetUserId,
            CancellationToken cancellationToken = default)
        {
            var grant = await ResolveGrantAsync(caller, targetUserId, cancellationToken);

            if (grant == SignatureViewGrant.Denied)
            {
                // Deliberately generic: the sentence must not disclose whether the user exists.
                return SignatureViewResult.Deny(
                    "You are not permitted to view this signature specimen. The form is printed " +
                    "with the signer name, role and date instead.");
            }

            // Reuses YOUR query, unchanged: IsActive && RecordStatus == Active && RevokedAt == null.
            var specimen = await _signatures.GetActiveAsync(targetUserId, cancellationToken);

            // RULE 1: nothing on file is a normal state, answered with 204.
            if (specimen is null) return SignatureViewResult.NoSpecimen(grant);

            // A row whose file reference is unusable must behave EXACTLY like "no specimen",
            // otherwise the client would fetch `fileUrl` and receive a 404 it cannot interpret.
            if (!specimen.IsUsableForStamping || !specimen.HasResolvableFile)
            {
                _logger.LogWarning(
                    "Signature {SignatureId} of user {UserId} is active but not resolvable; reported as absent.",
                    specimen.Id, targetUserId);
                return SignatureViewResult.NoSpecimen(grant);
            }

            return SignatureViewResult.Found(ToActiveResponse(specimen), grant);
        }

        // =================================================================================
        // 3. GET /api/signatures/{signatureId}/file
        // =================================================================================

        public async Task<SignatureStreamResult> TryOpenFileAsync(
            User caller,
            Guid signatureId,
            CancellationToken cancellationToken = default)
        {
            if (caller is null) return SignatureStreamResult.Deny("No authenticated session.");
            if (signatureId == Guid.Empty) return SignatureStreamResult.NotFound();

            // RULE 4: resolve the OWNER first. Authorising on "is logged in" alone would let any
            // session enumerate specimen Guids.
            var owner = await _context.UserSignatures
                .AsNoTracking()
                .Where(s => s.Id == signatureId)
                .Select(s => new { s.UserId, s.RevokedAt, s.RecordStatus })
                .FirstOrDefaultAsync(cancellationToken);

            if (owner is null) return SignatureStreamResult.NotFound();

            var grant = await ResolveGrantAsync(caller, owner.UserId, cancellationToken);
            if (grant == SignatureViewGrant.Denied)
            {
                return SignatureStreamResult.Deny(
                    "You are not permitted to view this signature specimen.");
            }

            // A REVOKED specimen is still streamed when it is bound to a historical stamp:
            // revoking rotates the ACTIVE pointer, it must never blank an approval that was
            // already printed (see UserSignature.Revoke / Supersede). It is refused only when
            // the row itself was soft-deleted.
            if (owner.RecordStatus == RecordStatus.Deleted) return SignatureStreamResult.NotFound();

            // Reuses YOUR file opener, unchanged (it also verifies the file exists on disk).
            var opened = await _signatures.OpenFileAsync(signatureId, cancellationToken);
            if (opened is null) return SignatureStreamResult.NotFound();

            var (content, contentType, fileName) = opened.Value;
            return SignatureStreamResult.Ok(
                content,
                string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType,
                string.IsNullOrWhiteSpace(fileName) ? $"signature-{signatureId:N}" : fileName,
                grant);
        }

        // =================================================================================
        // 4. PROJECTION
        // =================================================================================

        /// <summary>
        /// RULE 2: seven fields, no storage locator, no SHA-256 digest, and `FileUrl` built from
        /// the NON-ADMIN route so `signature-render.ts` can fetch it with an approver session.
        /// </summary>
        private static ActiveSignatureResponse ToActiveResponse(UserSignature specimen) => new()
        {
            UserId = specimen.UserId,
            SignatureId = specimen.Id,
            FileUrl = SignatureReadRoutes.FileUrlOf(specimen.Id),
            FileKind = specimen.FileKind.ToString(),   // "Image" | "Pdf" — the client sniffs this
            ContentType = specimen.ContentType,
            Version = specimen.Version,
            UploadedAt = specimen.UploadedAt
        };
    }
}