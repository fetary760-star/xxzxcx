using System;

namespace CMT.Application.SelfEvaluation.Contracts.Signature
{
    /// <summary>
    /// Result of POST /api/admin/signatures (multipart upload).
    /// NOTE: StoragePath is deliberately NOT exposed. The client receives only an
    /// authorised streaming URL.
    /// </summary>
    public sealed class UserSignatureResponse
    {
        public Guid Id { get; set; }

        public long UserId { get; set; }
        public string UserFullName { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
        public string UserRoleLabel { get; set; } = string.Empty;

        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;

        /// <summary>"Image" or "Pdf".</summary>
        public string FileKind { get; set; } = string.Empty;

        public long FileSizeBytes { get; set; }

        /// <summary>Short hash prefix, for the admin table only.</summary>
        public string FileSha256Short { get; set; } = string.Empty;

        public bool IsActive { get; set; }
        public int Version { get; set; }

        public DateTime UploadedAt { get; set; }
        public string UploadedBy { get; set; } = string.Empty;
        public DateTime? RevokedAt { get; set; }

        /// <summary>Authorised streaming endpoint, e.g. "/api/admin/signatures/{id}/file".</summary>
        public string FileUrl { get; set; } = string.Empty;

        public string Remarks { get; set; } = string.Empty;
    }

    /// <summary>One row of the admin dashboard signature table.</summary>
    public sealed class SignatureCoverageRow
    {
        public long UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string RoleLabel { get; set; } = string.Empty;
        public bool IsActiveUser { get; set; }

        /// <summary>False = this user cannot have an image stamped on approval yet.</summary>
        public bool HasActiveSignature { get; set; }

        public Guid? SignatureId { get; set; }
        public DateTime? UploadedAt { get; set; }
        public int Version { get; set; }
        public string FileUrl { get; set; } = string.Empty;

        /// <summary>True when the role signs forms, so a missing specimen is a real gap.</summary>
        public bool IsApproverRole { get; set; }
    }

    /// <summary>Outcome of one stamping attempt, surfaced in WorkflowActionResponse.</summary>
    public sealed class SignatureStampResult
    {
        public bool Applied { get; set; }
        public Guid? UserSignatureId { get; set; }
        public string SignerName { get; set; } = string.Empty;
        public string SignerRole { get; set; } = string.Empty;
        public DateTime SignedAtUtc { get; set; }
        public string SignatureHash { get; set; } = string.Empty;

        /// <summary>Populated when Applied is false, e.g. "no active specimen on file".</summary>
        public string? Warning { get; set; }
    }

    public static class SignatureErrorCodes
    {
        public const string UserNotFound        = "SIGNATURE_USER_NOT_FOUND";
        public const string FileMissing         = "SIGNATURE_FILE_MISSING";
        public const string FileTooLarge        = "SIGNATURE_FILE_TOO_LARGE";
        public const string ContentTypeInvalid  = "SIGNATURE_CONTENT_TYPE_INVALID";
        public const string ExtensionInvalid    = "SIGNATURE_EXTENSION_INVALID";
        public const string ContentMalformed    = "SIGNATURE_CONTENT_MALFORMED";
        public const string NotFound            = "SIGNATURE_NOT_FOUND";
        public const string AdminOnly           = "SIGNATURE_ADMIN_ONLY";
        public const string StorageFailure      = "SIGNATURE_STORAGE_FAILURE";
    }
}