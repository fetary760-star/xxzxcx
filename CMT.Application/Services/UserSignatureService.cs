using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Application.SelfEvaluation.Model;
using CMT.Application.SelfEvaluation.Options;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Default implementation. Files live on the local content root under
    /// SignatureStorageOptions.Root; only the relative path reaches the database.
    /// </summary>
    public class UserSignatureService : IUserSignatureService
    {
        private readonly ApplicationDbContext _context;
        private readonly HierarchyRuleService _hierarchy;
        private readonly SignatureStorageOptions _options;
        private readonly ILogger<UserSignatureService> _logger;
        private readonly string _contentRoot;

        public UserSignatureService(
            ApplicationDbContext context,
            HierarchyRuleService hierarchy,
            IOptions<SignatureStorageOptions> options,
            ILogger<UserSignatureService> logger,
            IContentRootAccessor contentRoot)
        {
            _context = context;
            _hierarchy = hierarchy;
            _options = options.Value;
            _logger = logger;
            _contentRoot = contentRoot.ContentRootPath;
        }

        // =================================================================================
        // UPLOAD
        // =================================================================================

        public async Task<OperationResult<UserSignatureResponse>> UploadAsync(
            User adminUser,
            long targetUserId,
            Stream content,
            string fileName,
            string contentType,
            long fileSizeBytes,
            string? remarks,
            CancellationToken cancellationToken = default)
        {
            // ---------- 1. authorisation: Admin only ----------
            if (RoleHierarchy.Normalize(adminUser.Role) != OrgRoles.Admin)
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    "Only an Admin may upload signature specimens.",
                    SignatureErrorCodes.AdminOnly);
            }

            // ---------- 2. target user must exist and be usable ----------
            var target = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == targetUserId
                                       && u.RecordStatus != RecordStatus.Deleted,
                                    cancellationToken);

            if (target is null)
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    $"User {targetUserId} does not exist.",
                    SignatureErrorCodes.UserNotFound);
            }

            // ---------- 3. validate the file ----------
            if (content is null || fileSizeBytes <= 0)
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    "No file was received.", SignatureErrorCodes.FileMissing);
            }

            if (fileSizeBytes > _options.MaxFileSizeBytes)
            {
                var maxMb = _options.MaxFileSizeBytes / 1024d / 1024d;
                return OperationResult<UserSignatureResponse>.Fail(
                    $"The signature file must not exceed {maxMb:0.#} MB.",
                    SignatureErrorCodes.FileTooLarge);
            }

            var normalisedContentType = (contentType ?? string.Empty).Trim().ToLowerInvariant();
            if (!_options.AllowedContentTypes.Contains(normalisedContentType, StringComparer.OrdinalIgnoreCase))
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    "Only PNG, JPEG, WEBP images or a PDF may be uploaded as a signature.",
                    SignatureErrorCodes.ContentTypeInvalid);
            }

            var extension = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
            if (!_options.AllowedExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    $"'{extension}' is not an accepted signature file extension.",
                    SignatureErrorCodes.ExtensionInvalid);
            }

            // ---------- 4. buffer + magic-number check (never trust the declared MIME) ----------
            byte[] bytes;
            await using (var buffer = new MemoryStream())
            {
                await content.CopyToAsync(buffer, cancellationToken);
                bytes = buffer.ToArray();
            }

            var detectedKind = DetectKind(bytes);
            if (detectedKind is null)
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    "The uploaded file is not a valid PNG, JPEG, WEBP or PDF.",
                    SignatureErrorCodes.ContentMalformed);
            }

            var declaredIsPdf = normalisedContentType == "application/pdf";
            if (declaredIsPdf != (detectedKind == SignatureFileKind.Pdf))
            {
                return OperationResult<UserSignatureResponse>.Fail(
                    "The file content does not match its declared type.",
                    SignatureErrorCodes.ContentMalformed);
            }

            var sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

            // ---------- 5. write to disk with a server-generated name ----------
            // The original file name NEVER influences the path: no traversal, no collision.
            var relativeDirectory = Path.Combine(_options.Root, targetUserId.ToString());
            var absoluteDirectory = Path.Combine(_contentRoot, relativeDirectory);
            Directory.CreateDirectory(absoluteDirectory);

            var storedName = $"{Guid.NewGuid():N}{extension}";
            var relativePath = Path.Combine(relativeDirectory, storedName).Replace('\\', '/');
            var absolutePath = Path.Combine(absoluteDirectory, storedName);

            try
            {
                await File.WriteAllBytesAsync(absolutePath, bytes, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to persist signature file for user {UserId}.", targetUserId);
                return OperationResult<UserSignatureResponse>.Fail(
                    "The signature file could not be saved.",
                    SignatureErrorCodes.StorageFailure);
            }

            // ---------- 6. supersede the previous active row, insert the new one ----------
            await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var previous = await _context.UserSignatures
                    .Where(s => s.UserId == targetUserId && s.IsActive)
                    .ToListAsync(cancellationToken);

                var nextVersion = 1;
                foreach (var row in previous)
                {
                    row.IsActive = false;
                    row.RevokedAt = DateTime.UtcNow;
                    row.RevokedByUserId = adminUser.Id;
                    row.UpdatedAt = DateTime.UtcNow;
                    row.UpdatedBy = adminUser.Username;
                    nextVersion = Math.Max(nextVersion, row.Version + 1);
                }

                var signature = new UserSignature
                {
                    Id = Guid.NewGuid(),
                    UserId = target.Id,
                    UserFullName = target.FullName,
                    UserRole = RoleHierarchy.Normalize(target.Role) ?? target.Role,
                    FileName = Path.GetFileName(fileName ?? storedName),
                    ContentType = normalisedContentType,
                    FileKind = detectedKind.Value,
                    FileSizeBytes = bytes.LongLength,
                    StoragePath = relativePath,
                    FileSha256 = sha256,
                    IsActive = true,
                    Version = nextVersion,
                    UploadedAt = DateTime.UtcNow,
                    UploadedByUserId = adminUser.Id,
                    UploadedBy = adminUser.Username,
                    Remarks = remarks ?? string.Empty,
                    RecordStatus = RecordStatus.Active,
                    UpdatedAt = DateTime.UtcNow,
                    UpdatedBy = adminUser.Username
                };

                _context.UserSignatures.Add(signature);

                _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
                {
                    Action = "SignatureUploaded",
                    EntityType = nameof(UserSignature),
                    EntityId = signature.Id,
                    PerformedBy = adminUser.Username,
                    Timestamp = DateTime.UtcNow,
                    Details = $"Signature v{nextVersion} linked to user {target.Id} ({target.FullName}); sha256={sha256[..12]}."
                });

                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                return OperationResult<UserSignatureResponse>.Ok(ToResponse(signature));
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);
                TryDelete(absolutePath);   // don't leave an orphan file behind
                _logger.LogError(ex, "Failed to link signature for user {UserId}.", targetUserId);
                return OperationResult<UserSignatureResponse>.Fail(
                    "The signature could not be linked to the user.",
                    SignatureErrorCodes.StorageFailure);
            }
        }

        // =================================================================================
        // REVOKE
        // =================================================================================

        public async Task<OperationResult<bool>> RevokeAsync(
            User adminUser,
            Guid signatureId,
            string? reason,
            CancellationToken cancellationToken = default)
        {
            if (RoleHierarchy.Normalize(adminUser.Role) != OrgRoles.Admin)
            {
                return OperationResult<bool>.Fail(
                    "Only an Admin may revoke signature specimens.",
                    SignatureErrorCodes.AdminOnly);
            }

            var signature = await _context.UserSignatures
                .FirstOrDefaultAsync(s => s.Id == signatureId, cancellationToken);

            if (signature is null)
            {
                return OperationResult<bool>.Fail(
                    "Signature not found.", SignatureErrorCodes.NotFound);
            }

            signature.IsActive = false;
            signature.RecordStatus = RecordStatus.Inactive;
            signature.RevokedAt = DateTime.UtcNow;
            signature.RevokedByUserId = adminUser.Id;
            signature.Remarks = string.IsNullOrWhiteSpace(reason) ? signature.Remarks : reason!;
            signature.UpdatedAt = DateTime.UtcNow;
            signature.UpdatedBy = adminUser.Username;

            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Action = "SignatureRevoked",
                EntityType = nameof(UserSignature),
                EntityId = signature.Id,
                PerformedBy = adminUser.Username,
                Timestamp = DateTime.UtcNow,
                Details = $"Signature of user {signature.UserId} revoked. Reason: {reason ?? "-"}."
            });

            await _context.SaveChangesAsync(cancellationToken);
            return OperationResult<bool>.Ok(true);
        }

        // =================================================================================
        // QUERIES
        // =================================================================================

        public Task<UserSignature?> GetActiveAsync(
            long userId, CancellationToken cancellationToken = default)
            => _context.UserSignatures
                .AsNoTracking()
                .Where(s => s.UserId == userId
                         && s.IsActive
                         && s.RecordStatus == RecordStatus.Active
                         && s.RevokedAt == null)
                .OrderByDescending(s => s.Version)
                .FirstOrDefaultAsync(cancellationToken);

        public async Task<List<UserSignatureResponse>> GetHistoryAsync(
            long userId, CancellationToken cancellationToken = default)
        {
            var rows = await _context.UserSignatures
                .AsNoTracking()
                .Where(s => s.UserId == userId)
                .OrderByDescending(s => s.Version)
                .ThenByDescending(s => s.UploadedAt)
                .ToListAsync(cancellationToken);

            return rows.Select(ToResponse).ToList();
        }

        public async Task<List<SignatureCoverageRow>> GetCoverageAsync(
            User currentUser,
            bool approverRolesOnly = false,
            CancellationToken cancellationToken = default)
        {
            var visible = await _hierarchy.GetVisibleUserIdsAsync(currentUser, cancellationToken);

            var users = await _context.Users
                .AsNoTracking()
                .Where(u => visible.Contains(u.Id) && u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync(cancellationToken);

            var signatures = await _context.UserSignatures
                .AsNoTracking()
                .Where(s => s.IsActive && s.RevokedAt == null)
                .ToListAsync(cancellationToken);

            var byUser = signatures
                .GroupBy(s => s.UserId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.Version).First());

            var rows = users.Select(u =>
            {
                byUser.TryGetValue(u.Id, out var signature);
                var canonical = RoleHierarchy.Normalize(u.Role) ?? u.Role;

                return new SignatureCoverageRow
                {
                    UserId = u.Id,
                    FullName = u.FullName,
                    Username = u.Username,
                    Role = canonical,
                    RoleLabel = RoleHierarchy.Label(canonical),
                    IsActiveUser = u.IsActive,
                    HasActiveSignature = signature is not null,
                    SignatureId = signature?.Id,
                    UploadedAt = signature?.UploadedAt,
                    Version = signature?.Version ?? 0,
                    FileUrl = signature is null ? string.Empty : FileUrlOf(signature.Id),
                    IsApproverRole = SignsForms(canonical)
                };
            });

            if (approverRolesOnly) rows = rows.Where(r => r.IsApproverRole);

            return rows
                .OrderBy(r => r.HasActiveSignature)                 // gaps first
                .ThenBy(r => RoleHierarchy.RankOf(r.Role))
                .ThenBy(r => r.FullName)
                .ToList();
        }

        public async Task<(Stream Content, string ContentType, string FileName)?> OpenFileAsync(
            Guid signatureId, CancellationToken cancellationToken = default)
        {
            var signature = await _context.UserSignatures
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == signatureId, cancellationToken);

            if (signature is null) return null;

            var absolute = Path.Combine(_contentRoot, signature.StoragePath);
            if (!File.Exists(absolute))
            {
                _logger.LogWarning(
                    "Signature {SignatureId} row exists but file {Path} is missing.",
                    signatureId, signature.StoragePath);
                return null;
            }

            Stream stream = new FileStream(
                absolute, FileMode.Open, FileAccess.Read, FileShare.Read, 8192, useAsync: true);

            return (stream, signature.ContentType, signature.FileName);
        }

        // =================================================================================
        // STAMPING - the heart of the requirement
        // =================================================================================

        public async Task<SignatureStampResult> StampAsync(
            FormWorkflowInstance instance,
            FormWorkflowStep step,
            User signer,
            CancellationToken cancellationToken = default)
        {
            // ---------- 1. capture identity + 2. automatic UTC timestamp ----------
            var signedAt = DateTime.UtcNow;
            var canonicalRole = RoleHierarchy.Normalize(signer.Role) ?? signer.Role;
            var roleLabel = RoleHierarchy.Label(canonicalRole);

            var result = new SignatureStampResult
            {
                SignerName = signer.FullName,
                SignerRole = canonicalRole,
                SignedAtUtc = signedAt
            };

            // ---------- 3. resolve the specimen BY USER ID ----------
            var specimen = await GetActiveAsync(signer.Id, cancellationToken);

            // ---------- 4. tamper-evidence hash ----------
            var hash = ComputeHash(instance.Id, step.StepNo, signer.Id, signedAt, specimen?.FileSha256);
            result.SignatureHash = hash;

            // ---------- 5. write the step columns ----------
            step.ActedByUserId = signer.Id;
            step.ActedByName = signer.FullName;
            step.ActedByRole = canonicalRole;
            step.ActedAt = signedAt;

            step.SignatureName = signer.FullName;
            step.SignatureRole = canonicalRole;
            step.SignatureDate = signedAt;
            step.SignatureHash = hash;
            step.UpdatedAt = signedAt;

            step.UserSignatureId = specimen?.Id;
            step.SignatureStoragePath = specimen?.StoragePath ?? string.Empty;
            step.SignatureImageApplied = specimen is not null;

            result.Applied = specimen is not null;
            result.UserSignatureId = specimen?.Id;

            if (specimen is null)
            {
                result.Warning =
                    $"{signer.FullName} ({roleLabel}) has no active signature specimen on file. " +
                    "The approval was recorded with name, role and timestamp; ask the Admin to " +
                    "upload the specimen so the image appears on the printed form.";

                _logger.LogWarning(
                    "Approval stamped WITHOUT an image: user {UserId}, instance {InstanceId}, step {StepNo}.",
                    signer.Id, instance.Id, step.StepNo);
            }

            // ---------- 6. the printed signature line (frozen) ----------
            if (step.SignatureBlock != SignatureBlockType.None)
            {
                // AMENDED (approval-history fix): a signature line is uniquely identified by
                // (instance, StepNo). Earlier lines of the SAME block belonging to a DIFFERENT
                // step are a DIFFERENT approver - e.g. MNT-1229B prints two "Approved by:"
                // lines (Mgr. Componenet Shop + TL. Component Engineering Support) and the
                // folder chain signs "Approved by" at several tiers. The old cross-step
                // supersede marked those earlier lines "Superseded by step N", the read
                // service then hid them, and the previous approver's name / date / signature
                // vanished from the printed block. Each step now owns its own line; only a
                // re-stamp of the SAME step (return -> re-approve) touches it, handled by
                // the in-place update below.
                var line = await _context.FormSignatures
                    .FirstOrDefaultAsync(s => s.FormWorkflowInstanceId == instance.Id
                                           && s.StepNo == step.StepNo,
                                        cancellationToken);

                if (line is null)
                {
                    line = new FormSignature
                    {
                        Id = Guid.NewGuid(),
                        FormWorkflowInstanceId = instance.Id,
                        StepNo = step.StepNo
                    };
                    _context.FormSignatures.Add(line);
                }

                line.FormSubmissionId = instance.FormSubmissionId;
                line.EvaluationFolderId = instance.EvaluationFolderId;
                line.Block = step.SignatureBlock;
                line.BlockCaption = FormWorkflowCatalog.SignatureCaption(step.SignatureBlock);

                line.UserId = signer.Id;
                line.PersonName = signer.FullName;
                line.PersonRole = canonicalRole;
                line.PersonRoleLabel = roleLabel;
                line.SignedAt = signedAt;
                line.SignatureHash = hash;

                line.UserSignatureId = specimen?.Id;
                line.SignatureStoragePath = specimen?.StoragePath ?? string.Empty;
                line.SignatureFileName = specimen?.FileName ?? string.Empty;
                line.SignatureContentType = specimen?.ContentType ?? string.Empty;
                line.SignatureFileSha256 = specimen?.FileSha256 ?? string.Empty;
                line.SignatureImageApplied = specimen is not null;

                if (specimen is null)
                    line.Remarks = "Specimen not on file at signing time.";
            }

            // ---------- 7. audit ----------
            _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
            {
                Action = "SignatureApplied",
                EntityType = nameof(FormWorkflowInstance),
                EntityId = instance.Id,
                PerformedBy = signer.Username,
                Timestamp = signedAt,
                Details =
                    $"{FormWorkflowCatalog.SignatureCaption(step.SignatureBlock)} - " +
                    $"{signer.FullName} ({roleLabel}) on step {step.StepNo} of {instance.FormType}; " +
                    $"image={(specimen is not null ? "applied" : "missing")}; hash={hash[..12]}."
            });

            // The engine owns SaveChangesAsync + the transaction.
            return result;
        }

        // =================================================================================
        // HELPERS
        // =================================================================================

        /// <summary>SHA-256 over instanceId|stepNo|userId|signedAt|fileSha256.</summary>
        private static string ComputeHash(
            Guid instanceId, int stepNo, long userId, DateTime signedAtUtc, string? fileSha256)
        {
            var payload = $"{instanceId:N}|{stepNo}|{userId}|{signedAtUtc:O}|{fileSha256 ?? "none"}";
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)))
                          .ToLowerInvariant();
        }

        /// <summary>Magic-number sniffing. Returns null when the payload is not accepted.</summary>
        private static SignatureFileKind? DetectKind(byte[] bytes)
        {
            if (bytes.Length < 12) return null;

            // %PDF
            if (bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)
                return SignatureFileKind.Pdf;

            // PNG \x89PNG\r\n\x1a\n
            if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
                return SignatureFileKind.Image;

            // JPEG FF D8 FF
            if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
                return SignatureFileKind.Image;

            // WEBP "RIFF"...."WEBP"
            if (bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46
             && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50)
                return SignatureFileKind.Image;

            return null;
        }

        /// <summary>True when the role appears as an eligible signer anywhere in the catalog.</summary>
        private static bool SignsForms(string? canonicalRole)
        {
            if (string.IsNullOrWhiteSpace(canonicalRole)) return false;

            return FormWorkflowCatalog.All
                .SelectMany(f => f.Steps)
                .Where(s => s.Signature != SignatureBlockType.None)
                .SelectMany(s => s.EligibleRoles)
                .Any(r => string.Equals(r, canonicalRole, StringComparison.OrdinalIgnoreCase));
        }

        private static string FileUrlOf(Guid signatureId)
            => $"/api/admin/signatures/{signatureId}/file";

        private UserSignatureResponse ToResponse(UserSignature s) => new()
        {
            Id = s.Id,
            UserId = s.UserId,
            UserFullName = s.UserFullName,
            UserRole = s.UserRole,
            UserRoleLabel = RoleHierarchy.Label(s.UserRole),
            FileName = s.FileName,
            ContentType = s.ContentType,
            FileKind = s.FileKind.ToString(),
            FileSizeBytes = s.FileSizeBytes,
            FileSha256Short = s.FileSha256.Length >= 12 ? s.FileSha256[..12] : s.FileSha256,
            IsActive = s.IsActive,
            Version = s.Version,
            UploadedAt = s.UploadedAt,
            UploadedBy = s.UploadedBy,
            RevokedAt = s.RevokedAt,
            FileUrl = FileUrlOf(s.Id),
            Remarks = s.Remarks
        };

        private void TryDelete(string absolutePath)
        {
            try { if (File.Exists(absolutePath)) File.Delete(absolutePath); }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Orphan signature file {Path} could not be removed.", absolutePath);
            }
        }
    }

    /// <summary>
    /// Tiny abstraction so CMT.Application.SelfEvaluation does not reference ASP.NET hosting.
    /// Implement in CMT.Web.Api.SelfEvaluation:
    ///     public sealed class ContentRootAccessor : IContentRootAccessor
    ///     {
    ///         public ContentRootAccessor(IWebHostEnvironment env) => ContentRootPath = env.ContentRootPath;
    ///         public string ContentRootPath { get; }
    ///     }
    /// </summary>
    public interface IContentRootAccessor
    {
        string ContentRootPath { get; }
    }
}