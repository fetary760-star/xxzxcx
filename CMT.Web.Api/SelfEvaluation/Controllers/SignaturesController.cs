/*
 * =====================================================================================
 * AMENDED v29 — PHASE 1 / DELIVERABLE 4 (NEW FILE): THE TWO READ-ONLY ENDPOINTS
 * Copy to: CMT.Web.Api.SelfEvaluation/Controllers/SignaturesController.cs
 *
 * THE EXACT SCOPE OF THIS PHASE (as you requested)
 * -----------------------------------------------
 *     GET /api/signatures/user/{userId}/active   -> 200 / 204 / 403
 *     GET /api/signatures/{signatureId}/file     -> 200 (bytes) / 403 / 404
 *
 * Nothing else. No upload, no revoke, no coverage: those stay in
 * `AdminSignaturesController` (Admin-only), which is NOT modified by this phase.
 *
 * WHY THIS CONTROLLER IS THE MISSING PIECE
 * ---------------------------------------
 * `CMT.Frontend/src/lib/workflow/signature-render.ts` — the module every printed signature cell
 * goes through — documents this contract verbatim in its header and calls it as step 1 of its
 * fallback chain. Because no controller answered `api/signatures/...`, step 1 died, step 2
 * (`/api/admin/signatures/user/{id}`) returned 403 for every non-Admin approver, and step 3
 * (typed name only) became the permanent state. That is why the name and the signature never
 * appear even though the matrix -> blocks -> print -> cell chain is correct.
 *
 * ROUTE-TEMPLATE ORDER IS DELIBERATE
 * ---------------------------------
 * `[HttpGet("user/{userId:long}/active")]` is declared BEFORE `[HttpGet("{signatureId:guid}/file")]`.
 * With the `:long` / `:guid` constraints the two can never collide, but keeping the literal
 * segment first documents the intent and protects against a future un-constrained route.
 *
 * FIVE HARD RULES
 *   (1) 204 IS A SUCCESS. A user whose Admin has not uploaded a specimen yet gets `NoContent`,
 *       and the form prints name + role + date. Returning 404 here would make the client treat
 *       a pending admin task as a broken approval (rule 3 of `signature-render.ts`).
 *   (2) 403 IS A SUCCESS FOR THE CLIENT TOO. `getJson()` returns null on any non-OK status, so
 *       the printed cell degrades to the typed name. The status is nevertheless honest, and the
 *       Next.js proxy MUST pass it through unchanged so the `errorCode` vocabulary survives.
 *   (3) NEVER CACHE A SPECIMEN. `Cache-Control: private, no-store` on BOTH endpoints, exactly
 *       as `AdminSignaturesController.GetFile` already does, plus `X-Content-Type-Options:
 *       nosniff` on the byte stream.
 *   (4) THE RAW StoragePath IS NEVER RETURNED. Enforced three times over: `[JsonIgnore]` on the
 *       entity, the seven-field `ActiveSignatureResponse`, and `stripStoragePaths` in the proxy.
 *   (5) `[Authorize]` ON THE CLASS. There is no anonymous access to a signature specimen, ever.
 * =====================================================================================
 */

using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Application.SelfEvaluation.Services;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    /// <summary>
    /// NON-ADMIN, READ-ONLY signature specimen access, used while PRINTING a controlled form.
    ///
    /// This is the server half of requirement 14:
    ///   "Dynamically fetch and embed digital signatures for the approvers and role-based
    ///    configurations."
    ///
    /// The ADMIN library (upload / revoke / coverage / history) remains in
    /// <c>AdminSignaturesController</c> and is untouched.
    /// </summary>
    [ApiController]
    [Route("api/signatures")]
    [Authorize]
    public class SignaturesController : ControllerBase
    {
        private readonly ISignatureReadService _reader;
        private readonly ICurrentUserAccessor _currentUser;

        public SignaturesController(
            ISignatureReadService reader,
            ICurrentUserAccessor currentUser)
        {
            _reader = reader;
            _currentUser = currentUser;
        }

        /// <summary>
        /// GET /api/signatures/user/{userId}/active
        ///
        /// The ACTIVE specimen of one user, for a printed signature cell.
        ///
        /// RESPONSES — the contract `signature-render.ts` already implements:
        ///   200 <see cref="ActiveSignatureResponse"/>  a specimen is on file; the client then
        ///                                              streams `fileUrl` and wraps it in an
        ///                                              object URL;
        ///   204 (no body)                              allowed, but NO specimen uploaded yet.
        ///                                              NOT an error — rule (1);
        ///   403 { errorCode, message }                 the caller may not view this specimen;
        ///   401                                        no session.
        /// </summary>
        [HttpGet("user/{userId:long}/active")]
        [ProducesResponseType(typeof(ActiveSignatureResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        public async Task<IActionResult> GetActiveOfUser(
            long userId,
            CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null)
            {
                return Unauthorized(new
                {
                    errorCode = SignatureReadErrorCodes.NotAuthenticated,
                    message = "Your session has expired. Sign in again to continue."
                });
            }

            // A malformed id is "nothing on file", never a 500.
            if (userId <= 0) return NoSpecimen();

            var result = await _reader.TryGetActiveAsync(me, userId, cancellationToken);

            if (!result.Allowed)
            {
                // RULE (2): an honest 403 that the client turns into a typed-name fallback.
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    errorCode = SignatureReadErrorCodes.ViewNotPermitted,
                    message = result.Message
                });
            }

            // RULE (1): allowed, but the Admin has not uploaded a specimen yet.
            if (result.Response is null) return NoSpecimen();

            // RULE (3): never cached, not even by the browser's disk cache.
            Response.Headers["Cache-Control"] = "private, no-store";
            return Ok(result.Response);
        }

        /// <summary>
        /// GET /api/signatures/{signatureId}/file
        ///
        /// The authorised byte stream of one specimen. The ONLY way a client ever reaches the
        /// bytes; the storage path is never disclosed (rule 4).
        ///
        /// RESPONSES:
        ///   200 image/png | image/jpeg | image/webp | application/pdf
        ///   403 { errorCode, message }   the caller may not view the OWNER of this row
        ///   404                          unknown id, soft-deleted row, or the file is gone
        ///   401                          no session
        ///
        /// NOTE ON REVOKED SPECIMENS: a revoked row is still streamed, because revoking only
        /// rotates the "active" pointer and must never blank a signature already printed on an
        /// executed form. Only a soft-deleted row yields 404.
        /// </summary>
        [HttpGet("{signatureId:guid}/file")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetFile(
            Guid signatureId,
            CancellationToken cancellationToken = default)
        {
            var me = await _currentUser.GetAsync(cancellationToken);
            if (me is null)
            {
                return Unauthorized(new
                {
                    errorCode = SignatureReadErrorCodes.NotAuthenticated,
                    message = "Your session has expired. Sign in again to continue."
                });
            }

            var result = await _reader.TryOpenFileAsync(me, signatureId, cancellationToken);

            if (!result.Allowed)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    errorCode = SignatureReadErrorCodes.ViewNotPermitted,
                    message = result.Message
                });
            }

            if (!result.Found || result.Content is null)
            {
                return NotFound(new
                {
                    errorCode = SignatureReadErrorCodes.NotFound,
                    message = "The signature specimen is no longer available."
                });
            }

            // RULE (3): private, never sniffed, never cached.
            Response.Headers["Cache-Control"] = "private, no-store";
            Response.Headers["X-Content-Type-Options"] = "nosniff";

            // `File(...)` disposes the stream for us. Inline (not an attachment): the specimen is
            // rendered inside an <img> / <object> on the printed form, never downloaded.
            return File(result.Content, result.ContentType, result.FileName);
        }

        /// <summary>
        /// RULE (1) in one place: 204 with the no-store header, so a client that polls a user
        /// whose specimen was just uploaded sees the new state on the very next request.
        /// </summary>
        private IActionResult NoSpecimen()
        {
            Response.Headers["Cache-Control"] = "private, no-store";
            return NoContent();
        }
    }
}