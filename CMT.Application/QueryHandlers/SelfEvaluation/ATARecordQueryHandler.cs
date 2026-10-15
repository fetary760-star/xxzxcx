using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.QueryHandlers.SelfEvaluation
{
    /// <summary>
    /// AMENDED v2: MapToATARecordDto now includes Authority and ResponsibleWorkshop fields.
    /// </summary>
    public class ATARecordQueryHandler :
        IRequestHandler<GetATARecordsByShopQuery, List<ATARecordDto>>,
        IRequestHandler<GetATARecordByIdQuery, ATARecordDto?>,
        IRequestHandler<GetATARecordsByComponentQuery, List<ATARecordDto>>,
        IRequestHandler<GetATARecordsByApprovalStatusQuery, List<ATARecordDto>>,
        IRequestHandler<GetATARecordsPendingMyApprovalQuery, List<ATARecordDto>>,
        IRequestHandler<GetFormSubmissionsByATARecordQuery, List<FormSubmissionDto>>,
        IRequestHandler<GetFormSubmissionByIdQuery, FormSubmissionDto?>,
        IRequestHandler<GetFormSubmissionByTypeQuery, FormSubmissionDto?>,
        IRequestHandler<GetFormSubmissionsPendingMyApprovalQuery, List<FormSubmissionDto>>,
        IRequestHandler<GetFileAttachmentsByATARecordQuery, List<FileAttachmentDto>>,
        IRequestHandler<GetFileAttachmentsByFormQuery, List<FileAttachmentDto>>,
        IRequestHandler<GetAllDepartmentsQuery, List<DepartmentDto>>,
        IRequestHandler<GetDepartmentByIdQuery, DepartmentDto?>,
        IRequestHandler<GetDepartmentHierarchyQuery, List<DepartmentDto>>
    {
        private readonly ApplicationDbContext _context;

        public ATARecordQueryHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        // ===== ATA Record Handlers =====

        public async Task<List<ATARecordDto>> Handle(GetATARecordsByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.ATARecords
                .Where(r => r.ShopId == request.ShopId && r.IsActive)
                .Include(r => r.Shop)
                .Include(r => r.ATAChapter)
                .Include(r => r.Component)
                .Include(r => r.FormSubmissions.Where(f => f.IsActive))
                .Select(r => MapToATARecordDto(r))
                .ToListAsync(cancellationToken);
        }

        public async Task<ATARecordDto?> Handle(GetATARecordByIdQuery request, CancellationToken cancellationToken)
        {
            var record = await _context.ATARecords
                .Where(r => r.Id == request.Id && r.IsActive)
                .Include(r => r.Shop)
                .Include(r => r.ATAChapter)
                .Include(r => r.Component)
                .Include(r => r.FormSubmissions.Where(f => f.IsActive))
                .FirstOrDefaultAsync(cancellationToken);

            return record == null ? null : MapToATARecordDto(record);
        }

        public async Task<List<ATARecordDto>> Handle(GetATARecordsByComponentQuery request, CancellationToken cancellationToken)
        {
            return await _context.ATARecords
                .Where(r => r.ComponentId == request.ComponentId && r.IsActive)
                .Include(r => r.Shop)
                .Include(r => r.ATAChapter)
                .Include(r => r.Component)
                .Include(r => r.FormSubmissions.Where(f => f.IsActive))
                .Select(r => MapToATARecordDto(r))
                .ToListAsync(cancellationToken);
        }

        public async Task<List<ATARecordDto>> Handle(GetATARecordsByApprovalStatusQuery request, CancellationToken cancellationToken)
        {
            return await _context.ATARecords
                .Where(r => r.ShopId == request.ShopId && r.ApprovalStatus == request.Status && r.IsActive)
                .Include(r => r.Shop)
                .Include(r => r.ATAChapter)
                .Include(r => r.Component)
                .Select(r => MapToATARecordDto(r))
                .ToListAsync(cancellationToken);
        }

        public async Task<List<ATARecordDto>> Handle(GetATARecordsPendingMyApprovalQuery request, CancellationToken cancellationToken)
        {
            // AMENDED v13: numeric assignment (AssignedToUserId) first, then the
            // canonical role pool from RoleHierarchy.ApproverRolesFor - never the
            // legacy lowercase UserRoles switch, which made records "disappear" for
            // users whose persisted role was a canonical / alias spelling.
            long? userId = long.TryParse(request.UserId, out var parsed) && parsed > 0 ? parsed : (long?)null;
            var canonicalRole = RoleHierarchy.Normalize(request.UserRole);
            var isAdmin = canonicalRole == OrgRoles.Admin;

            var pendingStatuses = PendingApprovalStatuses();

            var records = await _context.ATARecords
                .Where(r => r.IsActive && pendingStatuses.Contains(r.ApprovalStatus))
                .Include(r => r.Shop)
                .Include(r => r.ATAChapter)
                .Include(r => r.Component)
                .ToListAsync(cancellationToken);

            IEnumerable<ATARecord> mine;
            if (isAdmin)
            {
                mine = records;
            }
            else
            {
                mine = records.Where(r =>
                    (userId.HasValue && r.AssignedToUserId == userId.Value)
                    || (canonicalRole is not null
                        && RoleHierarchy.ApproverRolesFor(r.ApprovalStatus)
                              .Contains(canonicalRole, StringComparer.OrdinalIgnoreCase)));
            }

            return mine.Select(MapToATARecordDto).ToList();
        }

        // ===== Form Submission Handlers =====

        public async Task<List<FormSubmissionDto>> Handle(GetFormSubmissionsByATARecordQuery request, CancellationToken cancellationToken)
        {
            return await _context.FormSubmissions
                .Where(f => f.ATARecordId == request.ATARecordId && f.IsActive)
                .Include(f => f.FileAttachments.Where(a => a.IsActive))
                .Select(f => MapToFormSubmissionDto(f))
                .ToListAsync(cancellationToken);
        }

        public async Task<FormSubmissionDto?> Handle(GetFormSubmissionByIdQuery request, CancellationToken cancellationToken)
        {
            var form = await _context.FormSubmissions
                .Where(f => f.Id == request.Id && f.IsActive)
                .Include(f => f.FileAttachments.Where(a => a.IsActive))
                .FirstOrDefaultAsync(cancellationToken);

            return form == null ? null : MapToFormSubmissionDto(form);
        }

        public async Task<FormSubmissionDto?> Handle(GetFormSubmissionByTypeQuery request, CancellationToken cancellationToken)
        {
            var form = await _context.FormSubmissions
                .Where(f => f.ATARecordId == request.ATARecordId && f.FormType == request.FormType && f.IsActive)
                .Include(f => f.FileAttachments.Where(a => a.IsActive))
                .OrderByDescending(f => f.ApprovalStatus == ApprovalStatus.Rejected)
                .ThenByDescending(f => f.RevisionNumber)
                .FirstOrDefaultAsync(cancellationToken);

            return form == null ? null : MapToFormSubmissionDto(form);
        }

        public async Task<List<FormSubmissionDto>> Handle(GetFormSubmissionsPendingMyApprovalQuery request, CancellationToken cancellationToken)
        {
            // AMENDED v13: numeric CurrentApproverUserId / delegation assignment first,
            // then the catalog role pool (canonical + legacy variants) for unassigned
            // queues. The legacy UserRoles switch hid forms from every user whose
            // persisted role was a canonical spelling - the "disappearing approver" bug.
            long? userId = long.TryParse(request.UserId, out var parsed) && parsed > 0 ? parsed : (long?)null;
            var canonicalRole = RoleHierarchy.Normalize(request.UserRole);
            var isAdmin = canonicalRole == OrgRoles.Admin;

            var pendingStatuses = PendingApprovalStatuses();

            var forms = await _context.FormSubmissions
                .Where(f => f.IsActive && pendingStatuses.Contains(f.ApprovalStatus))
                .Include(f => f.FileAttachments.Where(a => a.IsActive))
                .ToListAsync(cancellationToken);

            IEnumerable<FormSubmission> mine;
            if (isAdmin)
            {
                mine = forms;
            }
            else
            {
                mine = forms.Where(f =>
                    (userId.HasValue && (f.CurrentApproverUserId == userId.Value || f.DelegatedToUserId == userId.Value))
                    || (f.CurrentApproverUserId is null
                        && canonicalRole is not null
                        && ApproverPoolFor(f).Contains(canonicalRole, StringComparer.OrdinalIgnoreCase)));
            }

            return mine.Select(MapToFormSubmissionDto).ToList();
        }

        // ===== AMENDED v13 read-path helpers =====

        private static List<ApprovalStatus> PendingApprovalStatuses() =>
            Enum.GetValues<ApprovalStatus>()
                .Where(s => ApprovalStatusInfo.StateOf(s) == FormLifecycleState.Pending
                         || s == ApprovalStatus.PendingAssignment)
                .ToList();

        private static string[] ApproverPoolFor(FormSubmission form) =>
            FormWorkflowCatalog.IsCatalogued(form.FormType)
                ? FormWorkflowCatalog.ApproverRolesFor(form.FormType, form.ApprovalStatus)
                : RoleHierarchy.ApproverRolesFor(form.ApprovalStatus);

        // ===== File Attachment Handlers =====

        public async Task<List<FileAttachmentDto>> Handle(GetFileAttachmentsByATARecordQuery request, CancellationToken cancellationToken)
        {
            return await _context.FormFileAttachments
                .Where(a => a.ATARecordId == request.ATARecordId && a.IsActive)
                .Select(a => new FileAttachmentDto
                {
                    Id = a.Id,
                    ATARecordId = a.ATARecordId,
                    FormSubmissionId = a.FormSubmissionId,
                    FileName = a.FileName,
                    ContentType = a.ContentType,
                    FileSizeBytes = a.FileSizeBytes,
                    StoragePath = a.StoragePath,
                    Description = a.Description,
                    FormType = a.FormType,
                    ApprovalStatus = a.ApprovalStatus,
                    UploadedAt = a.UploadedAt,
                    UploadedBy = a.UploadedBy
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<List<FileAttachmentDto>> Handle(GetFileAttachmentsByFormQuery request, CancellationToken cancellationToken)
        {
            return await _context.FormFileAttachments
                .Where(a => a.FormSubmissionId == request.FormSubmissionId && a.IsActive)
                .Select(a => new FileAttachmentDto
                {
                    Id = a.Id,
                    ATARecordId = a.ATARecordId,
                    FormSubmissionId = a.FormSubmissionId,
                    FileName = a.FileName,
                    ContentType = a.ContentType,
                    FileSizeBytes = a.FileSizeBytes,
                    StoragePath = a.StoragePath,
                    Description = a.Description,
                    FormType = a.FormType,
                    ApprovalStatus = a.ApprovalStatus,
                    UploadedAt = a.UploadedAt,
                    UploadedBy = a.UploadedBy
                })
                .ToListAsync(cancellationToken);
        }

        // ===== Department Handlers =====

        public async Task<List<DepartmentDto>> Handle(GetAllDepartmentsQuery request, CancellationToken cancellationToken)
        {
            return await _context.Departments
                .Where(d => d.IsActive)
                .Select(d => new DepartmentDto
                {
                    Id = d.Id,
                    Name = d.Name,
                    Code = d.Code,
                    Description = d.Description,
                    DirectorUserId = d.DirectorUserId,
                    ParentDepartmentId = d.ParentDepartmentId,
                    IsActive = d.IsActive
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<DepartmentDto?> Handle(GetDepartmentByIdQuery request, CancellationToken cancellationToken)
        {
            var dept = await _context.Departments
                .Where(d => d.Id == request.Id)
                .Include(d => d.SubDepartments.Where(s => s.IsActive))
                .Include(d => d.Shops.Where(s => s.IsActive))
                .FirstOrDefaultAsync(cancellationToken);

            if (dept == null) return null;

            return new DepartmentDto
            {
                Id = dept.Id,
                Name = dept.Name,
                Code = dept.Code,
                Description = dept.Description,
                DirectorUserId = dept.DirectorUserId,
                ParentDepartmentId = dept.ParentDepartmentId,
                IsActive = dept.IsActive,
                SubDepartments = dept.SubDepartments.Select(s => new DepartmentDto
                {
                    Id = s.Id,
                    Name = s.Name,
                    Code = s.Code,
                    IsActive = s.IsActive
                }).ToList(),
                Shops = dept.Shops.Select(s => new ShopSummaryDto
                {
                    Id = s.Id,
                    Name = s.Name,
                    TeamLeaderUserId = s.TeamLeaderUserId
                }).ToList()
            };
        }

        public async Task<List<DepartmentDto>> Handle(GetDepartmentHierarchyQuery request, CancellationToken cancellationToken)
        {
            // Get root departments (no parent)
            return await _context.Departments
                .Where(d => d.ParentDepartmentId == null && d.IsActive)
                .Include(d => d.SubDepartments.Where(s => s.IsActive))
                .Include(d => d.Shops.Where(s => s.IsActive))
                .Select(d => new DepartmentDto
                {
                    Id = d.Id,
                    Name = d.Name,
                    Code = d.Code,
                    Description = d.Description,
                    DirectorUserId = d.DirectorUserId,
                    IsActive = d.IsActive,
                    SubDepartments = d.SubDepartments.Select(s => new DepartmentDto
                    {
                        Id = s.Id,
                        Name = s.Name,
                        Code = s.Code,
                        IsActive = s.IsActive
                    }).ToList(),
                    Shops = d.Shops.Select(s => new ShopSummaryDto
                    {
                        Id = s.Id,
                        Name = s.Name,
                        TeamLeaderUserId = s.TeamLeaderUserId
                    }).ToList()
                })
                .ToListAsync(cancellationToken);
        }

        // ===== Mapping Helpers =====

        /// <summary>
        /// AMENDED v2: Now maps Authority and ResponsibleWorkshop fields from the entity.
        /// </summary>
        private static ATARecordDto MapToATARecordDto(Domain.Models.SelfEvaluation.ATARecord r)
        {
            return new ATARecordDto
            {
                Id = r.Id,
                Description = r.Description,
                PartNumber = r.PartNumber,
                SelfEvaluationDate = r.SelfEvaluationDate,
                Manufacturer = r.Manufacturer,
                ATAChapterCode = r.ATAChapterCode,
                CMMRevDate = r.CMMRevDate,
                RevNo = r.RevNo,
                Aircraft = r.Aircraft,
                // NEW: Map Authority and ResponsibleWorkshop
                Authority = r.Authority ?? string.Empty,
                ResponsibleWorkshop = r.ResponsibleWorkshop ?? string.Empty,
                // Legacy fields (backward compatibility)
                ECAAShop = r.ECAAShop ?? string.Empty,
                FAAShop = r.FAAShop ?? string.Empty,
                LetterRefNo = r.LetterRefNo,
                ShopId = r.ShopId,
                ShopName = r.Shop?.Name ?? string.Empty,
                ATAChapterId = r.ATAChapterId,
                ATAChapterNumber = r.ATAChapter?.ChapterNumber ?? string.Empty,
                ATAChapterTitle = r.ATAChapter?.Title ?? string.Empty,
                ComponentId = r.ComponentId,
                ComponentPartNumber = r.Component?.PartNumber ?? string.Empty,
                ApprovalStatus = r.ApprovalStatus,
                AssignedToUserId = r.AssignedToUserId,
                RevisionNumber = r.RevisionNumber,
                CreatedBy = r.CreatedBy,
                CreatedByUserId = r.CreatedByUserId,
                CreatorRole = r.CreatorRole,
                UpdatedBy = r.UpdatedBy,
                CreatedAt = r.CreatedAt,
                UpdatedAt = r.UpdatedAt,
                FormSubmissions = r.FormSubmissions?.Select(f => new FormSubmissionSummaryDto
                {
                    Id = f.Id,
                    FormType = f.FormType,
                    FormNo = f.FormNo,
                    ApprovalStatus = f.ApprovalStatus,
                    SubmittedDate = f.SubmittedDate,
                    ApprovedDate = f.ApprovedDate,
                    RevisionNumber = f.RevisionNumber
                }).ToList() ?? new()
            };
        }

        private static FormSubmissionDto MapToFormSubmissionDto(Domain.Models.SelfEvaluation.FormSubmission f)
        {
            return new FormSubmissionDto
            {
                Id = f.Id,
                ATARecordId = f.ATARecordId,
                FormType = f.FormType,
                FormNo = f.FormNo,
                RevNo = f.RevNo,
                RevDate = f.RevDate,
                FormDataJson = f.FormDataJson,
                ApprovalStatus = f.ApprovalStatus,
                SubmittedByUserId = f.SubmittedByUserId,
                SubmittedDate = f.SubmittedDate,
                ReviewedByUserId = f.ReviewedByUserId,
                ReviewedDate = f.ReviewedDate,
                ReviewComments = f.ReviewComments,
                ApprovedByUserId = f.ApprovedByUserId,
                ApprovedDate = f.ApprovedDate,
                RejectionReason = f.RejectionReason,
                DelegatedToUserId = f.DelegatedToUserId,
                DelegatedDate = f.DelegatedDate,
                DelegationReason = f.DelegationReason,
                RevisionNumber = f.RevisionNumber,
                CreatedBy = f.CreatedBy,
                CreatedAt = f.CreatedAt,
                UpdatedAt = f.UpdatedAt,
                FileAttachments = f.FileAttachments?.Select(a => new FileAttachmentDto
                {
                    Id = a.Id,
                    ATARecordId = a.ATARecordId,
                    FormSubmissionId = a.FormSubmissionId,
                    FileName = a.FileName,
                    ContentType = a.ContentType,
                    FileSizeBytes = a.FileSizeBytes,
                    StoragePath = a.StoragePath,
                    Description = a.Description,
                    FormType = a.FormType,
                    ApprovalStatus = a.ApprovalStatus,
                    UploadedAt = a.UploadedAt,
                    UploadedBy = a.UploadedBy
                }).ToList() ?? new()
            };
        }
    }
}