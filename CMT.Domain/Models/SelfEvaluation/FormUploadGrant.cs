using System;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    // =====================================================================================
    // AMENDED v13 - FormUploadGrant.cs   (NEW FILE)
    //
    // Requirement (FACILITY REQUIREMENT EVALUATION + CONSUMABLES, generalised to every
    // catalogued form):
    //   once the final approval / sign-off is completed, file upload capabilities are
    //   strictly locked. Users cannot upload additional attachments post-completion
    //   unless explicitly granted upload privileges by an Admin.
    //
    // A FormUploadGrant is that explicit Admin privilege: one row per (form, user),
    // time-boxed (max window enforced by FormUploadAuthorizationService), mandatory
    // reason, revocable, fully auditable. It is the ONLY sanctioned path for a
    // non-Admin to attach files to a completed form (Admins keep a break-glass path).
    //
    // BINDING RULES (identical to the rest of the solution)
    //   * Entity key is Guid; every user id is long (User.Id), never Guid.
    //   * Additive only: no existing entity was modified.
    //
    // MIGRATION (run on your side after the solution builds):
    //   dotnet ef migrations add AddFormUploadGrants --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    //   dotnet ef database update                    --project CMT.Domain --startup-project CMT.Web.Api.SelfEvaluation
    // =====================================================================================

    // An explicit, time-boxed UPLOAD PRIVILEGE granted by an Admin for a form whose
    // uploads are locked by completion.
    public class FormUploadGrant
    {
        public Guid Id { get; set; }

        // The form the privilege belongs to.
        public Guid FormSubmissionId { get; set; }

        // User the privilege is granted to. long, matches User.Id (v4 binding rule).
        public long ForUserId { get; set; }

        [MaxLength(200)]
        public string ForUserName { get; set; } = string.Empty;

        // Admin who granted the privilege. long, matches User.Id.
        public long GrantedByUserId { get; set; }

        [MaxLength(200)]
        public string GrantedByName { get; set; } = string.Empty;

        // Mandatory: why the lock is being lifted. Shown in the audit trail.
        [Required]
        [MaxLength(1000)]
        public string Reason { get; set; } = string.Empty;

        // When the privilege expires. The authorization service enforces a maximum
        // window (default 7 days) so a grant can never become a permanent hole in
        // the completion lock.
        public DateTime? ExpiresAt { get; set; }

        // Revoking sets this false; the row is kept for the audit trail.
        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        // Navigation
        public FormSubmission FormSubmission { get; set; } = null!;
    }
}
