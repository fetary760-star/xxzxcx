using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    /// <summary>
    /// AMENDED v13: the create path now enforces the completion upload lock SERVER SIDE
    /// (defence in depth) through IFormUploadAuthorizationService, so even a caller that
    /// bypassed the controller check cannot attach files to a completed form without an
    /// Admin grant / break-glass. Refusals throw AuthorizationDeniedException with a
    /// structured reason code (403 at the API).
    /// </summary>
    public class FileAttachmentCommandHandler :
        IRequestHandler<CreateFileAttachmentCommand, Guid>,
        IRequestHandler<DeleteFileAttachmentCommand, bool>,
        IRequestHandler<ApproveFileAttachmentCommand, bool>,
        IRequestHandler<RejectFileAttachmentCommand, bool>
    {
        private readonly ApplicationDbContext _context;
        private readonly IFormUploadAuthorizationService _uploadAuth;

        public FileAttachmentCommandHandler(
            ApplicationDbContext context,
            IFormUploadAuthorizationService uploadAuth)
        {
            _context = context;
            _uploadAuth = uploadAuth;
        }

        public async Task<Guid> Handle(CreateFileAttachmentCommand request, CancellationToken cancellationToken)
        {
            // ---- AMENDED v13: lock / grant / Admin enforcement BEFORE the record ----
            var auth = await _uploadAuth.AuthorizeUploadAsync(
                request.FormSubmissionId, request.ActorUserId, cancellationToken);

            if (!auth.Allowed)
            {
                throw new AuthorizationDeniedException(auth.Reason, auth.Message);
            }

            var attachment = new FormFileAttachment
            {
                Id = Guid.NewGuid(),
                ATARecordId = request.ATARecordId,
                FormSubmissionId = request.FormSubmissionId,
                FileName = request.FileName,
                ContentType = request.ContentType,
                FileSizeBytes = request.FileSizeBytes,
                StoragePath = request.StoragePath,
                Description = request.Description,
                FormType = request.FormType,
                ApprovalStatus = ApprovalStatus.Draft,
                IsActive = true,
                UploadedAt = DateTime.UtcNow,
                UploadedBy = request.UploadedBy
            };

            _context.FormFileAttachments.Add(attachment);

            if (auth.AdminBreakGlass || auth.GrantExpiresAt.HasValue)
            {
                _context.WorkflowAuditLogs.Add(new WorkflowAuditLog
                {
                    Id = Guid.NewGuid(),
                    Action = "Attachment uploaded on a LOCKED form",
                    WorkflowAction = WorkflowAction.Updated,
                    EntityType = "FormFileAttachment",
                    EntityId = attachment.Id,
                    PerformedBy = request.UploadedBy,
                    UserRole = "Admin", // File uploads on locked forms require Admin-level privilege
                    Details = auth.AdminBreakGlass
                        ? "Uploaded via Admin break-glass on a completed form."
                        : "Uploaded via Admin-granted privilege (expires " +
                          auth.GrantExpiresAt!.Value.ToUniversalTime().ToString("u") + ").",
                    Timestamp = DateTime.UtcNow
                });
            }

            await _context.SaveChangesAsync(cancellationToken);

            return attachment.Id;
        }

        public async Task<bool> Handle(DeleteFileAttachmentCommand request, CancellationToken cancellationToken)
        {
            var attachment = await _context.FormFileAttachments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (attachment == null) return false;

            attachment.IsActive = false;
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(ApproveFileAttachmentCommand request, CancellationToken cancellationToken)
        {
            var attachment = await _context.FormFileAttachments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (attachment == null || !attachment.IsActive) return false;

            attachment.ApprovalStatus = ApprovalStatus.Approved;
            attachment.ApprovedByUserId = Guid.TryParse(request.ApprovedBy, out var userId) ? userId : null;
            attachment.ApprovedDate = DateTime.UtcNow;
            attachment.ApprovalComments = request.Comments;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(RejectFileAttachmentCommand request, CancellationToken cancellationToken)
        {
            var attachment = await _context.FormFileAttachments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (attachment == null || !attachment.IsActive) return false;

            attachment.ApprovalStatus = ApprovalStatus.Rejected;
            attachment.ApprovalComments = request.Reason;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}