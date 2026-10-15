using System;
using System.Threading;
using System.Threading.Tasks;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED v13 - IFormUploadAuthorizationService.cs   (NEW FILE)
    //
    // Single server-side authority for the question: "MAY THIS USER ATTACH A FILE TO
    // THIS FORM RIGHT NOW?"
    //
    // It encodes the completion-lock requirement:
    //   once the final approval / sign-off is completed, uploads are LOCKED; only an
    //   Admin (break-glass) or a user holding an ACTIVE, UNEXPIRED FormUploadGrant
    //   granted by an Admin may upload afterwards.
    //
    // It also centralises the AMENDED v13 "authorization denial reasons": every refusal
    // carries a machine-readable AuthorizationDenialReason code plus a human message, so
    // the API returns 403 with { code, message } instead of a bare "false".
    // =====================================================================================

    // Machine-readable denial codes surfaced to clients and logs.
    public enum AuthorizationDenialReason
    {
        None = 0,

        // ----- identity -----
        NotAuthenticated = 1,
        UserNotFound = 2,

        // ----- upload lock -----
        FormNotFound = 3,
        CompletedFormLocked = 4,
        NoActiveGrant = 5,
        GrantExpired = 6,

        // ----- admin operations -----
        AdminOnly = 7,

        // ----- workflow actions (submit / approve / reject / return / delegate) -----
        NotCurrentApprover = 8,
        NotInApproverRole = 9,
        NoApproverResolved = 10,
        FormNotPending = 11,
        StepAlreadyActed = 12
    }

    // Result of an upload authorization check. Allowed is the only field callers MUST
    // branch on; Reason / Message / GrantExpiresAt exist for the 403 payload and the UI.
    public sealed class UploadAuthorizationResult
    {
        public bool Allowed { get; set; }
        public AuthorizationDenialReason Reason { get; set; } = AuthorizationDenialReason.None;
        public string Message { get; set; } = string.Empty;

        // When Allowed because of a grant: its expiry, so the UI can show "until ...".
        public DateTime? GrantExpiresAt { get; set; }

        // When Allowed because the actor is an Admin bypassing the lock.
        public bool AdminBreakGlass { get; set; }

        public static UploadAuthorizationResult Allow() => new UploadAuthorizationResult { Allowed = true };

        public static UploadAuthorizationResult AllowByAdmin() => new UploadAuthorizationResult
        {
            Allowed = true,
            AdminBreakGlass = true,
            Message = "Upload permitted via Admin break-glass on a completed form."
        };

        public static UploadAuthorizationResult AllowByGrant(DateTime? expiresAt) => new UploadAuthorizationResult
        {
            Allowed = true,
            GrantExpiresAt = expiresAt,
            Message = "Upload permitted by an active Admin-granted upload privilege."
        };

        public static UploadAuthorizationResult Deny(AuthorizationDenialReason reason, string message) =>
            new UploadAuthorizationResult { Allowed = false, Reason = reason, Message = message };
    }

    // Thrown by handlers when an action is refused. Controllers translate it into
    // 403 { code, message } so clients get a structured denial reason, not a stringly-typed
    // BadRequest. Carries the same enum as UploadAuthorizationResult.
    public sealed class AuthorizationDeniedException : Exception
    {
        public AuthorizationDenialReason Reason { get; }

        // Stable machine code for the API payload (e.g. "NoActiveGrant").
        public string Code => Reason.ToString();

        public AuthorizationDeniedException(AuthorizationDenialReason reason, string message)
            : base(message)
        {
            Reason = reason;
        }
    }

    public interface IFormUploadAuthorizationService
    {
        // THE hot path, called by FileAttachmentController BEFORE any byte is written to
        // disk, and again inside FileAttachmentCommandHandler as defence in depth.
        // formSubmissionId NULL means an ATA-level attachment: normal permission rules,
        // always allowed here (the caller still requires authentication).
        Task<UploadAuthorizationResult> AuthorizeUploadAsync(
            Guid? formSubmissionId,
            long userId,
            CancellationToken cancellationToken = default);
    }
}