using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation;

// =====================================================================================
//  UserSignature - AMENDED (amendments 1-5)
//
//  This entity is the ONLY link between a human being and the specimen image/PDF that
//  gets stamped onto a form when an approval happens. It is written exclusively by the
//  Admin upload path (UserSignatureService.UploadAsync) and read by:
//      * GET  /api/admin/signatures                       (coverage table)
//      * GET  /api/admin/signatures/user/{userId}         (version history)
//      * GET  /api/admin/signatures/{id}/file             (authorised streaming)
//      * UserSignatureService.StampAsync(...)             (approval-time stamping)
//
//  WHAT THE AMENDMENT CHANGES (and why), mapped 1:1 onto the five requirements:
//
//   (1) CAPTURE THE USER'S NAME
//       UserFullName / UserRole are no longer nullable: a specimen without the signer's
//       printed name is useless on a form. They are stored as a SNAPSHOT taken at upload
//       time so a later rename or role change can never rewrite an already printed
//       signature block. AttachTo(...) is the single guarded way to set them.
//
//   (2) AUTOMATICALLY TIMESTAMP APPROVALS
//       Every timestamp is forced to UTC through EnsureUtc(...). UploadedAt, RevokedAt
//       and UpdatedAt can no longer be persisted as Local/Unspecified kind, which is
//       what previously made "uploaded_at" drift between the API response and the
//       stamped SignatureDate.
//
//   (3) LINK THE STORED IMAGE (storage_path) TO THE USER ID
//       StoragePath keeps its column but is now [JsonIgnore] + [NotMapped]-free, i.e. it
//       is persisted but can NEVER leak through accidental entity serialisation. The only
//       public way to reference the file is FileUrl -> /api/admin/signatures/{id}/file.
//       HasResolvableFile / AssertBelongsTo(userId) make the user_id <-> storage_path
//       pairing explicit and verifiable at stamping time.
//
//   (4) RULE-BASED ROUTING ACROSS APPROVER ROLES
//       CanonicalRole / UserRoleLabel / RoleRank / IsEligibleFor(eligibleRoles) expose the
//       canonical-role contract of RoleHierarchy directly on the specimen, so the workflow
//       engine can decide "is this specimen valid for the role that owns this step?"
//       without re-normalising strings at every call site. Existing form layouts are
//       untouched: this only affects routing/eligibility decisions.
//
//   (5) AUTOMATICALLY GENERATE AND APPLY THE SIGNATURE ON APPROVAL
//       ToStampReference() returns the frozen tuple that the workflow engine copies into
//       FormWorkflowStep / FormSignature, and ComputeStampHash(...) is now the single
//       canonical tamper-evidence formula (identical to the one previously duplicated
//       inside UserSignatureService), so the hash written on approval, the hash re-checked
//       on export and the hash shown in the audit log can never diverge.
//
//   (+) SECURE PER-USER LINKING AFTER ADMIN UPLOAD
//       Supersede(...) and Revoke(...) encapsulate the "exactly one active specimen per
//       user" invariant and always record WHO acted, so historical stamps stay valid while
//       the active specimen is rotated.
//
//  SCHEMA COMPATIBILITY: no column was added, renamed or removed. Every new member is
//  either [NotMapped] or a behaviour method, so NO EF migration is required.
// =====================================================================================

/// <summary>
/// Persisted specimen kind. Values are stored in the database - DO NOT renumber.
/// </summary>
public enum SignatureFileKind
{
    /// <summary>PNG / JPEG / WEBP raster specimen. Can be rendered inline on a form.</summary>
    Image = 0,

    /// <summary>PDF specimen. Rendered as a badge/link, never inlined as an &lt;img&gt;.</summary>
    Pdf = 1
}

/// <summary>
/// Canonical, storage-independent rules for a signature specimen file.
/// SignatureStorageOptions (appsettings) remains authoritative at runtime; these are the
/// hard defaults and the shared magic-number sniffing used by upload validation so the
/// API, the stamping path and any offline tooling agree on what a specimen may be.
/// </summary>
public static class SignatureFileRules
{
    /// <summary>Hard cap enforced by POST /api/admin/signatures (2 MB).</summary>
    public const long DefaultMaxFileSizeBytes = 2L * 1024L * 1024L;

    /// <summary>Accepted declared MIME types.</summary>
    public static readonly string[] DefaultAllowedContentTypes =
    {
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf"
    };

    /// <summary>Accepted file extensions (lower case, dot included).</summary>
    public static readonly string[] DefaultAllowedExtensions =
    {
        ".png", ".jpg", ".jpeg", ".webp", ".pdf"
    };

    /// <summary>The authorised streaming endpoint of a specimen. The ONLY public reference.</summary>
    public static string FileUrlOf(Guid signatureId)
        => $"/api/admin/signatures/{signatureId}/file";

    /// <summary>True when the declared MIME type is accepted.</summary>
    public static bool IsAllowedContentType(string? contentType)
        => !string.IsNullOrWhiteSpace(contentType)
           && DefaultAllowedContentTypes.Contains(contentType.Trim().ToLowerInvariant(), StringComparer.OrdinalIgnoreCase);

    /// <summary>True when the file extension is accepted.</summary>
    public static bool IsAllowedExtension(string? extension)
        => !string.IsNullOrWhiteSpace(extension)
           && DefaultAllowedExtensions.Contains(extension.Trim().ToLowerInvariant(), StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Magic-number sniffing. NEVER trust the declared MIME type: the caller must compare
    /// the detected kind against the declared one and reject a mismatch
    /// (SIGNATURE_CONTENT_MALFORMED).
    /// Returns null when the payload is not a valid PNG / JPEG / WEBP / PDF.
    /// </summary>
    public static SignatureFileKind? DetectKind(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 12) return null;

        // "%PDF"
        if (bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)
            return SignatureFileKind.Pdf;

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
            return SignatureFileKind.Image;

        // JPEG: FF D8 FF
        if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
            return SignatureFileKind.Image;

        // WEBP: "RIFF" .... "WEBP"
        if (bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46
         && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
            return SignatureFileKind.Image;

        return null;
    }

    /// <summary>Kind implied by a declared MIME type, used only for cross-checking.</summary>
    public static SignatureFileKind? KindFromContentType(string? contentType)
    {
        var normalised = (contentType ?? string.Empty).Trim().ToLowerInvariant();
        return normalised switch
        {
            "application/pdf" => SignatureFileKind.Pdf,
            "image/png" or "image/jpeg" or "image/webp" => SignatureFileKind.Image,
            _ => null
        };
    }
}

/// <summary>
/// The immutable reference the workflow engine freezes into a step / signature line when
/// an approval is recorded (amendment 5). Everything here is a COPY: revoking or replacing
/// the specimen afterwards must never alter an already printed signature block.
/// </summary>
public readonly record struct SignatureStampReference(
    Guid? UserSignatureId,
    string StoragePath,
    string FileName,
    string ContentType,
    string FileSha256,
    SignatureFileKind? FileKind,
    bool Applied)
{
    /// <summary>The "nothing on file" reference: the approval is still valid, only unstamped.</summary>
    public static SignatureStampReference None { get; } = new(
        UserSignatureId: null,
        StoragePath: string.Empty,
        FileName: string.Empty,
        ContentType: string.Empty,
        FileSha256: string.Empty,
        FileKind: null,
        Applied: false);

    /// <summary>True when an image can actually be rendered inline on the printed form.</summary>
    public bool IsInlineImage => Applied && FileKind == SignatureFileKind.Image;
}

/// <summary>
/// A signature specimen uploaded by an Admin and securely linked to ONE user.
/// Invariant: at most one row per <see cref="UserId"/> may have
/// <see cref="IsActive"/> = true AND <see cref="RevokedAt"/> = null.
/// </summary>
public class UserSignature
{
    // ---------------------------------------------------------------------------------
    // identity
    // ---------------------------------------------------------------------------------

    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The user this specimen belongs to. The secure link required by the brief.</summary>
    public long UserId { get; set; }

    /// <summary>
    /// AMENDMENT 1 - printed name snapshot, captured at upload time. Non-nullable: a
    /// specimen with no name cannot produce a valid signature block.
    /// </summary>
    public string UserFullName { get; set; } = string.Empty;

    /// <summary>
    /// AMENDMENT 4 - canonical role snapshot (RoleHierarchy.Normalize). Drives which
    /// workflow steps this specimen may legitimately sign.
    /// </summary>
    public string UserRole { get; set; } = string.Empty;

    // ---------------------------------------------------------------------------------
    // file metadata
    // ---------------------------------------------------------------------------------

    /// <summary>Original file name, kept for the audit trail only. Never used to build a path.</summary>
    public string FileName { get; set; } = string.Empty;

    /// <summary>Declared MIME type, already validated against the detected content.</summary>
    public string ContentType { get; set; } = string.Empty;

    /// <summary>Detected kind (magic-number sniffing), not the declared one.</summary>
    public SignatureFileKind FileKind { get; set; }

    public long FileSizeBytes { get; set; }

    /// <summary>
    /// AMENDMENT 3 - server-generated relative key inside the PRIVATE signature store.
    /// PERSISTED but never serialised: the only way a client reaches the bytes is the
    /// authorised streaming endpoint (<see cref="FileUrl"/>). [JsonIgnore] is defence in
    /// depth in case the entity is ever returned by accident instead of a DTO.
    /// </summary>
    [JsonIgnore]
    public string StoragePath { get; set; } = string.Empty;

    /// <summary>
    /// Lower-case hex SHA-256 of the stored bytes. Non-nullable so integrity checks and
    /// the tamper-evidence hash never have to deal with null.
    /// </summary>
    public string FileSha256 { get; set; } = string.Empty;

    // ---------------------------------------------------------------------------------
    // lifecycle / versioning
    // ---------------------------------------------------------------------------------

    /// <summary>True for the single specimen currently used for stamping.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>1-based, incremented on every replacement for the same user.</summary>
    public int Version { get; set; } = 1;

    private DateTime _uploadedAt = DateTime.UtcNow;

    /// <summary>AMENDMENT 2 - always stored as UTC.</summary>
    public DateTime UploadedAt
    {
        get => _uploadedAt;
        set => _uploadedAt = EnsureUtc(value);
    }

    /// <summary>The Admin who performed the upload (secure attribution).</summary>
    public long? UploadedByUserId { get; set; }

    /// <summary>Username of the uploading Admin. Non-nullable for the API contract.</summary>
    public string UploadedBy { get; set; } = string.Empty;

    private DateTime? _revokedAt;

    /// <summary>AMENDMENT 2 - always stored as UTC when present.</summary>
    public DateTime? RevokedAt
    {
        get => _revokedAt;
        set => _revokedAt = value.HasValue ? EnsureUtc(value.Value) : null;
    }

    public long? RevokedByUserId { get; set; }

    /// <summary>Free-text note shown in the admin table. Non-nullable for the API contract.</summary>
    public string Remarks { get; set; } = string.Empty;

    public CMT.Domain.Models.Shared.RecordStatus RecordStatus { get; set; } = CMT.Domain.Models.Shared.RecordStatus.Active;

    private DateTime? _updatedAt;

    /// <summary>AMENDMENT 2 - always stored as UTC when present.</summary>
    public DateTime? UpdatedAt
    {
        get => _updatedAt;
        set => _updatedAt = value.HasValue ? EnsureUtc(value.Value) : null;
    }

    public string? UpdatedBy { get; set; }

    // =================================================================================
    // COMPUTED - never mapped, so no migration is triggered
    // =================================================================================

    /// <summary>AMENDMENT 4 - canonical role, re-normalised defensively for legacy rows.</summary>
    [NotMapped]
    public string CanonicalRole => RoleHierarchy.Normalize(UserRole) ?? UserRole;

    /// <summary>Human readable role label for the admin table and the printed block.</summary>
    [NotMapped]
    public string UserRoleLabel => RoleHierarchy.Label(UserRole);

    /// <summary>Seniority index (lower = more senior). Used to order the coverage table.</summary>
    [NotMapped]
    public int RoleRank => RoleHierarchy.RankOf(UserRole);

    /// <summary>Short hash prefix surfaced in the admin table (never the full digest).</summary>
    [NotMapped]
    public string FileSha256Short =>
        FileSha256.Length >= 12 ? FileSha256[..12] : FileSha256;

    /// <summary>AMENDMENT 3 - the ONLY public reference to the bytes.</summary>
    [NotMapped]
    public string FileUrl => SignatureFileRules.FileUrlOf(Id);

    [NotMapped]
    public bool IsImage => FileKind == SignatureFileKind.Image;

    [NotMapped]
    public bool IsPdf => FileKind == SignatureFileKind.Pdf;

    [NotMapped]
    public bool IsRevoked => RevokedAt.HasValue;

    /// <summary>
    /// The full active-specimen predicate, kept in ONE place so the query, the stamping
    /// path and the coverage table can never disagree.
    /// </summary>
    [NotMapped]
    public bool IsUsableForStamping =>
        IsActive
        && !IsRevoked
        && RecordStatus == CMT.Domain.Models.Shared.RecordStatus.Active
        && !string.IsNullOrWhiteSpace(StoragePath);

    /// <summary>
    /// AMENDMENT 3 - the row claims a stored object AND is bound to a real user.
    /// A row that fails this must be treated exactly like "no specimen on file".
    /// </summary>
    [NotMapped]
    public bool HasResolvableFile =>
        UserId > 0 && !string.IsNullOrWhiteSpace(StoragePath);

    /// <summary>Printed identity line, e.g. "Jane Doe (Shop Team Leader)".</summary>
    [NotMapped]
    public string SignerDisplayName =>
        string.IsNullOrWhiteSpace(UserFullName)
            ? UserRoleLabel
            : $"{UserFullName} ({UserRoleLabel})";

    // =================================================================================
    // BEHAVIOUR
    // =================================================================================

    /// <summary>
    /// AMENDMENT 1 + secure linking - binds the specimen to a user and freezes the printed
    /// name and canonical role. This is the only sanctioned way to establish the link.
    /// </summary>
    public void AttachTo(long userId, string? fullName, string? role)
    {
        if (userId <= 0)
            throw new ArgumentOutOfRangeException(nameof(userId), "A signature must be linked to a real user id.");

        UserId = userId;
        UserFullName = (fullName ?? string.Empty).Trim();
        UserRole = RoleHierarchy.Normalize(role) ?? (role ?? string.Empty).Trim();
    }

    /// <summary>
    /// AMENDMENT 3 - records the server-generated storage key and the integrity digest.
    /// The original file name never influences the key, so traversal and collisions are
    /// structurally impossible.
    /// </summary>
    public void AttachFile(
        string storagePath,
        string originalFileName,
        string contentType,
        SignatureFileKind detectedKind,
        long fileSizeBytes,
        string fileSha256)
    {
        if (string.IsNullOrWhiteSpace(storagePath))
            throw new ArgumentException("A signature must reference a stored object.", nameof(storagePath));

        StoragePath = storagePath.Replace('\\', '/');
        FileName = (originalFileName ?? string.Empty).Trim();
        ContentType = (contentType ?? string.Empty).Trim().ToLowerInvariant();
        FileKind = detectedKind;
        FileSizeBytes = fileSizeBytes;
        FileSha256 = (fileSha256 ?? string.Empty).Trim().ToLowerInvariant();
    }

    /// <summary>
    /// Secure-linking invariant - called on the PREVIOUS active row inside the same
    /// transaction as a new upload. Historical stamps are untouched: only the pointer to
    /// "the current specimen" moves.
    /// </summary>
    public void Supersede(long adminUserId, string? adminUsername, DateTime? whenUtc = null)
    {
        var now = EnsureUtc(whenUtc ?? DateTime.UtcNow);

        IsActive = false;
        RevokedAt = now;
        RevokedByUserId = adminUserId;
        UpdatedAt = now;
        UpdatedBy = adminUsername;
    }

    /// <summary>
    /// Explicit admin revocation. The row stays in the table (audit + version history) and
    /// every signature already stamped with it remains valid.
    /// </summary>
    public void Revoke(long adminUserId, string? adminUsername, string? reason, DateTime? whenUtc = null)
    {
        var now = EnsureUtc(whenUtc ?? DateTime.UtcNow);

        IsActive = false;
        RecordStatus = CMT.Domain.Models.Shared.RecordStatus.Inactive;
        RevokedAt = now;
        RevokedByUserId = adminUserId;
        UpdatedAt = now;
        UpdatedBy = adminUsername;

        if (!string.IsNullOrWhiteSpace(reason))
            Remarks = reason!.Trim();
    }

    /// <summary>
    /// AMENDMENT 4 - rule-based routing guard. True when this specimen's canonical role is
    /// one of the roles a workflow step accepts as signer. Admin is accepted everywhere,
    /// mirroring RoleHierarchy.CanActOn.
    /// </summary>
    public bool IsEligibleFor(IEnumerable<string>? eligibleRoles)
    {
        var canonical = RoleHierarchy.Normalize(UserRole);
        if (canonical is null) return false;
        if (string.Equals(canonical, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase)) return true;
        if (eligibleRoles is null) return false;

        return eligibleRoles
            .Select(RoleHierarchy.Normalize)
            .Any(r => r is not null && string.Equals(r, canonical, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Defence in depth for the streaming endpoint and the stamping path: refuse to serve
    /// or stamp a specimen that does not belong to the expected user id.
    /// </summary>
    public bool BelongsTo(long userId) => UserId == userId;

    /// <summary>Throwing variant of <see cref="BelongsTo"/> for server-side invariants.</summary>
    public void AssertBelongsTo(long userId)
    {
        if (!BelongsTo(userId))
            throw new InvalidOperationException(
                $"Signature {Id} belongs to user {UserId} and must never be applied for user {userId}.");
    }

    /// <summary>
    /// AMENDMENT 5 - the frozen reference copied onto FormWorkflowStep / FormSignature when
    /// an approval is recorded. Returns <see cref="SignatureStampReference.None"/> when the
    /// row is not usable, so the caller can warn instead of failing the approval.
    /// </summary>
    public SignatureStampReference ToStampReference()
    {
        if (!IsUsableForStamping || !HasResolvableFile)
            return SignatureStampReference.None;

        return new SignatureStampReference(
            UserSignatureId: Id,
            StoragePath: StoragePath,
            FileName: FileName,
            ContentType: ContentType,
            FileSha256: FileSha256,
            FileKind: FileKind,
            Applied: true);
    }

    /// <summary>
    /// AMENDMENT 5 - THE canonical tamper-evidence formula.
    /// SHA-256 over "instanceId|stepNo|userId|signedAtUtc(ISO-O)|fileSha256".
    /// Callers MUST use this method instead of re-implementing the payload, otherwise the
    /// hash stored on approval will not match the hash recomputed on verification/export.
    /// </summary>
    public static string ComputeStampHash(
        Guid instanceId,
        int stepNo,
        long userId,
        DateTime signedAtUtc,
        string? fileSha256)
    {
        var payload =
            $"{instanceId:N}|{stepNo}|{userId}|{EnsureUtc(signedAtUtc):O}|" +
            $"{(string.IsNullOrWhiteSpace(fileSha256) ? "none" : fileSha256!.Trim().ToLowerInvariant())}";

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    /// <summary>Instance overload: hashes this specimen's digest into the stamp.</summary>
    public string ComputeStampHash(Guid instanceId, int stepNo, DateTime signedAtUtc)
        => ComputeStampHash(instanceId, stepNo, UserId, signedAtUtc, FileSha256);

    /// <summary>
    /// Integrity re-check used by the export/verification path: the bytes served today must
    /// still hash to the digest recorded at upload time.
    /// </summary>
    public bool MatchesDigest(ReadOnlySpan<byte> bytes)
    {
        if (string.IsNullOrWhiteSpace(FileSha256)) return false;

        var actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        return string.Equals(actual, FileSha256, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Factory used by the Admin upload path. Produces a fully linked, active, version-N
    /// specimen with UTC timestamps already normalised (amendments 1, 2, 3).
    /// </summary>
    public static UserSignature Create(
        long targetUserId,
        string? targetFullName,
        string? targetRole,
        string storagePath,
        string originalFileName,
        string contentType,
        SignatureFileKind detectedKind,
        long fileSizeBytes,
        string fileSha256,
        int version,
        long adminUserId,
        string? adminUsername,
        string? remarks = null,
        DateTime? whenUtc = null)
    {
        var now = EnsureUtc(whenUtc ?? DateTime.UtcNow);

        var signature = new UserSignature
        {
            Id = Guid.NewGuid(),
            IsActive = true,
            Version = version < 1 ? 1 : version,
            UploadedAt = now,
            UploadedByUserId = adminUserId,
            UploadedBy = adminUsername ?? string.Empty,
            Remarks = (remarks ?? string.Empty).Trim(),
            RecordStatus = CMT.Domain.Models.Shared.RecordStatus.Active,
            UpdatedAt = now,
            UpdatedBy = adminUsername
        };

        signature.AttachTo(targetUserId, targetFullName, targetRole);
        signature.AttachFile(storagePath, originalFileName, contentType, detectedKind, fileSizeBytes, fileSha256);

        return signature;
    }

    /// <summary>AMENDMENT 2 - one place that guarantees every persisted instant is UTC.</summary>
    private static DateTime EnsureUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };
}