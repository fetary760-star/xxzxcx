/*
 * =====================================================================================
 * AMENDED v29 — PHASE 1 / DELIVERABLE 2 (NEW FILE): THE READ-ONLY SPECIMEN SERVICE
 * Copy to: CMT.Application.SelfEvaluation/Services/ISignatureReadService.cs
 *
 * WHY A SEPARATE INTERFACE INSTEAD OF EXTENDING IUserSignatureService
 * ------------------------------------------------------------------
 * You listed `CMT.Application.SelfEvaluation/Services/IUserSignatureService.cs` and
 * `CMT.Application.SelfEvaluation/Services/UserSignatureService.cs` among the files you have ALREADY updated
 * yourself. Adding members to that interface would break your build until you also edited the
 * implementation, i.e. it would force a manual merge on two files you own.
 *
 * `ISignatureReadService` is therefore a NEW, ADDITIVE abstraction in the SAME namespace
 * (`CMT.Application.SelfEvaluation.Services`). It COMPOSES your existing service rather than replacing it:
 *   - `IUserSignatureService.GetActiveAsync(userId)`  -> resolves the active specimen row;
 *   - `IUserSignatureService.OpenFileAsync(id)`       -> opens the bytes for streaming.
 * Both already exist on your interface, unchanged. Nothing in this phase rewrites them.
 *
 * WHAT IT ADDS THAT YOUR SERVICE DOES NOT HAVE
 * --------------------------------------------
 * A VIEW POLICY. `AdminSignaturesController` has exactly one rule ("Admin, or your own row"),
 * which is correct for the specimen LIBRARY but wrong for PRINTING a form: a Manager opening
 * MNT-1229B must be able to render the Shop Team Leader's specimen on the "prepared  By:"
 * line, and he is not an Admin. Without a second, narrower policy the printed block can only
 * ever show the reader's OWN signature.
 *
 * THE POLICY, IN PRECEDENCE ORDER (implemented in SignatureReadService.cs)
 *   1. SELF            — the caller's own specimen. This is what makes the v28 provisional
 *                        "Prepared By / Approved By" line paint WITH an image on a brand-new
 *                        form that has no workflow instance at all.
 *   2. ADMIN           — unchanged from the admin library.
 *   3. RECORDED SIGNER — the target user has at least one row in `FormSignatures`, i.e. his
 *                        specimen is already stamped on a controlled form. Anyone who may open
 *                        a form may render the signatures printed on it; refusing here would
 *                        blank an ALREADY LEGALLY EXECUTED approval block.
 *   4. HIERARCHY SCOPE — the target user is inside the caller's visible scope
 *                        (`HierarchyRuleService.GetVisibleUserIdsAsync`, the same predicate
 *                        the coverage table uses) AND the target holds an approver role. This
 *                        covers the pre-approval preview: an STL previewing the MGR line, a
 *                        Manager previewing his Special Team Leader counter-signature.
 *   5. OTHERWISE       — 403 SIGNATURE_VIEW_NOT_PERMITTED. Never 404: hiding the existence of
 *                        a user behind a 404 would make the client retry the admin fallback
 *                        and log a second failure.
 *
 * FOUR HARD RULES
 *   (1) NEVER THROW FOR A MISSING SPECIMEN. `TryGetActiveAsync` returns
 *       `Allowed = true, Response = null` -> the controller answers 204, and the form prints
 *       name + role + date. Requirement 13 explicitly allows the specimen to arrive later.
 *   (2) NO STORAGE LOCATOR EVER LEAVES THIS SERVICE. Only `ActiveSignatureResponse` (which has
 *       no such member) and an opened `Stream` cross the boundary.
 *   (3) READ-ONLY. No `SaveChangesAsync`, no mutation, no audit row: rendering a form is not a
 *       domain event. Stamping stays exclusively in `IUserSignatureService.StampAsync`.
 *   (4) THE FILE ENDPOINT RE-CHECKS THE OWNER. Authorising `{signatureId}/file` by "is the
 *       caller logged in" would let any session enumerate specimen Guids. The owner of the row
 *       is resolved first, then the SAME policy is applied.
 * =====================================================================================
 */

using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Why a caller was allowed to read a specimen. Returned for logging / diagnostics only —
    /// it is NEVER serialised to the browser, because it would disclose organisational shape.
    /// </summary>
    public enum SignatureViewGrant
    {
        /// <summary>Not allowed. The controller answers 403.</summary>
        Denied = 0,

        /// <summary>The caller is the owner. The provisional self-fill path.</summary>
        Self = 1,

        /// <summary>The caller holds the Admin role.</summary>
        Admin = 2,

        /// <summary>The target user is already a recorded signer on at least one form.</summary>
        RecordedSigner = 3,

        /// <summary>The target user is an approver inside the caller's visible hierarchy.</summary>
        HierarchyScope = 4
    }

    /// <summary>
    /// Outcome of one read attempt. Deliberately NOT <c>OperationResult&lt;T&gt;</c>: this
    /// surface has THREE distinct successful outcomes (payload / no specimen / not permitted)
    /// which must map onto 200 / 204 / 403, and collapsing "no specimen" into a failure is
    /// exactly the mistake that would turn an un-uploaded specimen into a broken approval.
    /// </summary>
    public sealed class SignatureViewResult
    {
        /// <summary>False -> 403 with <see cref="SignatureReadErrorCodes.ViewNotPermitted"/>.</summary>
        public bool Allowed { get; init; }

        /// <summary>Why access was granted. For server-side logging only.</summary>
        public SignatureViewGrant Grant { get; init; }

        /// <summary>
        /// The payload for 200. NULL together with <c>Allowed = true</c> means
        /// "no active specimen on file" -> 204 (rule 1), which is NOT an error.
        /// </summary>
        public ActiveSignatureResponse? Response { get; init; }

        /// <summary>Human sentence rendered by the client on 403. Never leaks a user name.</summary>
        public string Message { get; init; } = string.Empty;

        public static SignatureViewResult Deny(string message) => new()
        {
            Allowed = false,
            Grant = SignatureViewGrant.Denied,
            Response = null,
            Message = message
        };

        /// <summary>Allowed, and a specimen exists -> 200.</summary>
        public static SignatureViewResult Found(ActiveSignatureResponse response, SignatureViewGrant grant) => new()
        {
            Allowed = true,
            Grant = grant,
            Response = response,
            Message = string.Empty
        };

        /// <summary>Allowed, but nothing is on file yet -> 204 (rule 1).</summary>
        public static SignatureViewResult NoSpecimen(SignatureViewGrant grant) => new()
        {
            Allowed = true,
            Grant = grant,
            Response = null,
            Message = string.Empty
        };
    }

    /// <summary>An opened specimen plus the identity checks already performed.</summary>
    public sealed class SignatureStreamResult
    {
        public bool Allowed { get; init; }
        public bool Found { get; init; }
        public SignatureViewGrant Grant { get; init; }

        public Stream? Content { get; init; }
        public string ContentType { get; init; } = string.Empty;
        public string FileName { get; init; } = string.Empty;

        public string Message { get; init; } = string.Empty;

        public static SignatureStreamResult Deny(string message) => new()
        {
            Allowed = false, Found = false, Grant = SignatureViewGrant.Denied, Message = message
        };

        public static SignatureStreamResult NotFound() => new()
        {
            Allowed = true, Found = false, Grant = SignatureViewGrant.Denied, Message = "Signature not found."
        };

        public static SignatureStreamResult Ok(
            Stream content, string contentType, string fileName, SignatureViewGrant grant) => new()
        {
            Allowed = true,
            Found = true,
            Grant = grant,
            Content = content,
            ContentType = contentType,
            FileName = fileName
        };
    }

    /// <summary>
    /// The NON-ADMIN, READ-ONLY specimen surface consumed by
    /// <c>CMT.Frontend/src/lib/workflow/signature-render.ts</c> while PRINTING a form.
    ///
    /// Register in Program.cs next to the existing signature service:
    /// <code>
    ///     builder.Services.AddScoped&lt;IUserSignatureService, UserSignatureService&gt;();
    ///     builder.Services.AddScoped&lt;ISignatureReadService, SignatureReadService&gt;();
    /// </code>
    /// </summary>
    public interface ISignatureReadService
    {
        /// <summary>
        /// Resolves the ACTIVE specimen of <paramref name="targetUserId"/> for
        /// <paramref name="caller"/>, applying the view policy documented in the file header.
        ///
        /// Maps onto the endpoint as:
        ///   Allowed = false                 -> 403 SIGNATURE_VIEW_NOT_PERMITTED
        ///   Allowed = true, Response = null -> 204 (no specimen uploaded yet — NOT an error)
        ///   Allowed = true, Response != null-> 200 ActiveSignatureResponse
        /// </summary>
        Task<SignatureViewResult> TryGetActiveAsync(
            User caller,
            long targetUserId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Opens the bytes of one specimen after re-checking that <paramref name="caller"/> may
        /// view the ROW OWNER (rule 4). The caller is responsible for disposing the stream —
        /// ASP.NET Core's <c>File(...)</c> result does that automatically.
        /// </summary>
        Task<SignatureStreamResult> TryOpenFileAsync(
            User caller,
            Guid signatureId,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// The policy on its own, without touching the specimen table. Exposed so the folder
        /// PDF exporter can filter a signer list BEFORE issuing one request per signer.
        /// </summary>
        Task<SignatureViewGrant> ResolveGrantAsync(
            User caller,
            long targetUserId,
            CancellationToken cancellationToken = default);
    }
}