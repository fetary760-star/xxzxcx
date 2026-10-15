using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    /// <summary>
    /// Create a file attachment record (after file is uploaded to storage).
    /// </summary>
    public class CreateFileAttachmentCommand : IRequest<Guid>
    {
        public Guid? ATARecordId { get; set; }
        public Guid? FormSubmissionId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long FileSizeBytes { get; set; }
        public string StoragePath { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string FormType { get; set; } = string.Empty;
        public string UploadedBy { get; set; } = string.Empty;

        // AMENDED v13: numeric id of the acting user (User.Id). The upload-lock check
        // MUST run against this value, never against UploadedBy (a display name).
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Delete a file attachment.
    /// </summary>
    public class DeleteFileAttachmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }

    /// <summary>
    /// Approve a file attachment.
    /// </summary>
    public class ApproveFileAttachmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ApprovedBy { get; set; } = string.Empty;
        public string Comments { get; set; } = string.Empty;
    }

    /// <summary>
    /// Reject a file attachment.
    /// </summary>
    public class RejectFileAttachmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string RejectedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
    }
}