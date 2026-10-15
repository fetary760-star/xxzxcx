using System;
using System.Collections.Generic;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Queries.SelfEvaluation
{
    // ===== ATA Record Queries =====

    public class GetATARecordsByShopQuery : IRequest<List<ATARecordDto>>
    {
        public Guid ShopId { get; set; }
    }

    public class GetATARecordByIdQuery : IRequest<ATARecordDto?>
    {
        public Guid Id { get; set; }
    }

    public class GetATARecordsByComponentQuery : IRequest<List<ATARecordDto>>
    {
        public Guid? ComponentId { get; set; }

    }

    public class GetATARecordsByApprovalStatusQuery : IRequest<List<ATARecordDto>>
    {
        public Guid ShopId { get; set; }
        public ApprovalStatus Status { get; set; }
    }

    public class GetATARecordsPendingMyApprovalQuery : IRequest<List<ATARecordDto>>
    {
        public string UserId { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
    }

    // ===== Form Submission Queries =====

    public class GetFormSubmissionsByATARecordQuery : IRequest<List<FormSubmissionDto>>
    {
        public Guid ATARecordId { get; set; }
    }

    public class GetFormSubmissionByIdQuery : IRequest<FormSubmissionDto?>
    {
        public Guid Id { get; set; }
    }

    public class GetFormSubmissionByTypeQuery : IRequest<FormSubmissionDto?>
    {
        public Guid ATARecordId { get; set; }
        public string FormType { get; set; } = string.Empty;
    }

    public class GetFormSubmissionsPendingMyApprovalQuery : IRequest<List<FormSubmissionDto>>
    {
        public string UserId { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
    }

    // ===== File Attachment Queries =====

    public class GetFileAttachmentsByATARecordQuery : IRequest<List<FileAttachmentDto>>
    {
        public Guid ATARecordId { get; set; }
    }

    public class GetFileAttachmentsByFormQuery : IRequest<List<FileAttachmentDto>>
    {
        public Guid FormSubmissionId { get; set; }
    }

    // ===== Department Queries =====

    public class GetAllDepartmentsQuery : IRequest<List<DepartmentDto>> { }

    public class GetDepartmentByIdQuery : IRequest<DepartmentDto?>
    {
        public Guid Id { get; set; }
    }

    public class GetDepartmentHierarchyQuery : IRequest<List<DepartmentDto>> { }

    // ===== DTOs =====

    /// <summary>
    /// AMENDED v2: Added Authority and ResponsibleWorkshop fields.
    /// These replace the legacy ECAAShop/FAAShop approach.
    /// </summary>
    public class ATARecordDto
    {
        public Guid Id { get; set; }
        public string Description { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public DateTime? SelfEvaluationDate { get; set; }
        public string Manufacturer { get; set; } = string.Empty;
        public string ATAChapterCode { get; set; } = string.Empty;
        public string CMMRevDate { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public string Aircraft { get; set; } = string.Empty;

        /// <summary>
        /// Shop Capability / Authority - comma-separated values (e.g., "ECAA,FAA,EASA")
        /// Used for filtering: ALL, ECAA, FAA, EASA with counts.
        /// </summary>
        public string Authority { get; set; } = string.Empty;

        /// <summary>
        /// Responsible Workshop - comma-separated values (e.g., "Galley,Electric")
        /// Used for filtering: ALL, Galley, Electric with counts.
        /// </summary>
        public string ResponsibleWorkshop { get; set; } = string.Empty;

        // Legacy fields (backward compatibility)
        public string ECAAShop { get; set; } = string.Empty;
        public string FAAShop { get; set; } = string.Empty;

        public string LetterRefNo { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public string ShopName { get; set; } = string.Empty;
        public Guid? ATAChapterId { get; set; }

        public string ATAChapterNumber { get; set; } = string.Empty;
        public string ATAChapterTitle { get; set; } = string.Empty;
        public Guid? ComponentId { get; set; }

        public string ComponentPartNumber { get; set; } = string.Empty;
        public ApprovalStatus ApprovalStatus { get; set; }

        /// <summary>PHASE 0 retype: long, matches ATARecord.AssignedToUserId.</summary>
        public long? AssignedToUserId { get; set; }
        public int RevisionNumber { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public long? CreatedByUserId { get; set; }
        public string CreatorRole { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<FormSubmissionSummaryDto> FormSubmissions { get; set; } = new();
    }

    public class FormSubmissionDto
    {
        public Guid Id { get; set; }
        public Guid ATARecordId { get; set; }
        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public DateTime? RevDate { get; set; }
        public string FormDataJson { get; set; } = "{}";
        public ApprovalStatus ApprovalStatus { get; set; }
        public long? SubmittedByUserId { get; set; }
        public DateTime? SubmittedDate { get; set; }
        public long? ReviewedByUserId { get; set; }
        public DateTime? ReviewedDate { get; set; }
        public string ReviewComments { get; set; } = string.Empty;
        public long? ApprovedByUserId { get; set; }
        public DateTime? ApprovedDate { get; set; }
        public string RejectionReason { get; set; } = string.Empty;
        public long? DelegatedToUserId { get; set; }
        public DateTime? DelegatedDate { get; set; }
        public string DelegationReason { get; set; } = string.Empty;
        public int RevisionNumber { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<FileAttachmentDto> FileAttachments { get; set; } = new();
    }

    public class FormSubmissionSummaryDto
    {
        public Guid Id { get; set; }
        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public ApprovalStatus ApprovalStatus { get; set; }
        public DateTime? SubmittedDate { get; set; }
        public DateTime? ApprovedDate { get; set; }
        public int RevisionNumber { get; set; }
    }

    public class FileAttachmentDto
    {
        public Guid Id { get; set; }
        public Guid? ATARecordId { get; set; }
        public Guid? FormSubmissionId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = string.Empty;
        public long FileSizeBytes { get; set; }
        public string StoragePath { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string FormType { get; set; } = string.Empty;
        public ApprovalStatus ApprovalStatus { get; set; }
        public DateTime UploadedAt { get; set; }
        public string UploadedBy { get; set; } = string.Empty;
    }

    public class DepartmentDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public long? DirectorUserId { get; set; }          // ← Changed from Guid? to long?
    public string DirectorName { get; set; } = string.Empty;
    public Guid? ParentDepartmentId { get; set; }
    public string ParentDepartmentName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public List<DepartmentDto> SubDepartments { get; set; } = new();
    public List<ShopSummaryDto> Shops { get; set; } = new();
}

    public class ShopSummaryDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;

        /// <summary>PHASE 0 retype: long, matches Shop.TeamLeaderUserId.</summary>
        public long? TeamLeaderUserId { get; set; }
        public string TeamLeaderName { get; set; } = string.Empty;
        public int ATARecordCount { get; set; }
    }
}