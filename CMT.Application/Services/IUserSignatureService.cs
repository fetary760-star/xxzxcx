using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Application.SelfEvaluation.Model;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.Services
{
    /// <summary>
    /// Owns the signature specimen lifecycle (admin upload / revoke / stream) and the
    /// approval-time stamping. Nothing else in the solution may write
    /// FormSignature.SignatureStoragePath.
    /// </summary>
    public interface IUserSignatureService
    {
        // ---------- admin lifecycle ----------

        /// <summary>
        /// Stores an uploaded specimen and links it to <paramref name="targetUserId"/>.
        /// Supersedes the previous active row inside ONE transaction.
        /// Caller MUST already have verified that <paramref name="adminUser"/> is an Admin.
        /// </summary>
        Task<OperationResult<UserSignatureResponse>> UploadAsync(
            User adminUser,
            long targetUserId,
            Stream content,
            string fileName,
            string contentType,
            long fileSizeBytes,
            string? remarks,
            CancellationToken cancellationToken = default);

        /// <summary>Flips the active specimen to revoked. Historical stamps are untouched.</summary>
        Task<OperationResult<bool>> RevokeAsync(
            User adminUser,
            Guid signatureId,
            string? reason,
            CancellationToken cancellationToken = default);

        /// <summary>The active specimen of a user, or null.</summary>
        Task<UserSignature?> GetActiveAsync(
            long userId,
            CancellationToken cancellationToken = default);

        /// <summary>All versions for a user, newest first (admin audit view).</summary>
        Task<List<UserSignatureResponse>> GetHistoryAsync(
            long userId,
            CancellationToken cancellationToken = default);

        /// <summary>Dashboard table: every visible user + whether a specimen exists.</summary>
        Task<List<SignatureCoverageRow>> GetCoverageAsync(
            User currentUser,
            bool approverRolesOnly = false,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Opens the stored file for streaming. Returns null when the row or the file is
        /// gone. The caller enforces authorisation.
        /// </summary>
        Task<(Stream Content, string ContentType, string FileName)?> OpenFileAsync(
            Guid signatureId,
            CancellationToken cancellationToken = default);

        // ---------- approval-time stamping ----------

        /// <summary>
        /// THE CORE OF THE REQUIREMENT.
        /// Called by the workflow engine right after a step is approved / signed:
        ///   1. captures the signer's name and canonical role,
        ///   2. stamps DateTime.UtcNow,
        ///   3. resolves the signer's ACTIVE UserSignature by user id,
        ///   4. writes the frozen path onto the step AND the FormSignature line,
        ///   5. computes the tamper-evidence hash.
        ///
        /// Never throws for a missing specimen: the approval stays valid and
        /// SignatureStampResult.Applied is false with a Warning.
        /// Does NOT call SaveChangesAsync - the engine owns the transaction.
        /// </summary>
        Task<SignatureStampResult> StampAsync(
            FormWorkflowInstance instance,
            FormWorkflowStep step,
            User signer,
            CancellationToken cancellationToken = default);
    }
}