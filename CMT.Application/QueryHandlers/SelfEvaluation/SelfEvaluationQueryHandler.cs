using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.DTO.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.QueryHandlers.SelfEvaluation
{
    public class SelfEvaluationQueryHandler :
        IRequestHandler<GetAllShopsQuery, List<ShopDto>>,
        IRequestHandler<GetShopByIdQuery, ShopDto?>,
        IRequestHandler<GetComponentsByShopQuery, List<ComponentDto>>,
        IRequestHandler<GetComponentByIdQuery, ComponentDto?>,
        IRequestHandler<GetComponentsByATAChapterQuery, List<ComponentDto>>,
        IRequestHandler<GetCapabilityAssessmentsByShopQuery, List<CapabilityAssessmentDto>>,
        IRequestHandler<GetCapabilityAssessmentByIdQuery, CapabilityAssessmentDto?>,
        IRequestHandler<GetCapabilityAssessmentsByStatusQuery, List<CapabilityAssessmentDto>>,
        IRequestHandler<GetAirworthinessDirectivesByComponentQuery, List<TechnicalDataDto.AirworthinessDirectiveDto>>,
        IRequestHandler<GetServiceBulletinsByComponentQuery, List<TechnicalDataDto.ServiceBulletinDto>>,
        IRequestHandler<GetToolNeedsAnalysisByShopQuery, List<TechnicalDataDto.ToolNeedsAnalysisDto>>,
        IRequestHandler<GetSelfAuditChecklistByShopQuery, List<SelfAuditChecklistDto>>,
        IRequestHandler<GetSelfAuditChecklistByStatusQuery, List<SelfAuditChecklistDto>>,
        IRequestHandler<GetEmployeeProficiencyByShopQuery, List<EmployeeProficiencyDto>>,
        IRequestHandler<GetWorkflowAuditLogsByEntityQuery, List<WorkflowAuditLogDto>>,
        IRequestHandler<GetRecentWorkflowAuditLogsQuery, List<WorkflowAuditLogDto>>,
        IRequestHandler<GetDelegationsByShopQuery, List<ResponsibilityDelegationDto>>,
        IRequestHandler<GetShopDashboardSummaryQuery, ShopDashboardSummaryDto>
    {
        private readonly ApplicationDbContext _context;

        public SelfEvaluationQueryHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        // Shop Handlers
        public async Task<List<ShopDto>> Handle(GetAllShopsQuery request, CancellationToken cancellationToken)
        {
            return await _context.Shops
                .Where(s => s.IsActive)
                .Select(s => new ShopDto
                {
                    Id = s.Id,
                    Name = s.Name,
                    CertificateNumber = s.CertificateNumber,
                    Address = s.Address,
                    City = s.City,
                    State = s.State,
                    ZipCode = s.ZipCode,
                    Country = s.Country,
                    Phone = s.Phone,
                    Email = s.Email,
                    AccountableManager = s.AccountableManager,
                    QualityManager = s.QualityManager,
                    IsActive = s.IsActive,
                    CreatedAt = s.CreatedAt,
                    UpdatedAt = s.UpdatedAt
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<ShopDto?> Handle(GetShopByIdQuery request, CancellationToken cancellationToken)
        {
            var shop = await _context.Shops.FindAsync(new object[] { request.Id }, cancellationToken);
            if (shop == null) return null;

            return new ShopDto
            {
                Id = shop.Id,
                Name = shop.Name,
                CertificateNumber = shop.CertificateNumber,
                Address = shop.Address,
                City = shop.City,
                State = shop.State,
                ZipCode = shop.ZipCode,
                Country = shop.Country,
                Phone = shop.Phone,
                Email = shop.Email,
                AccountableManager = shop.AccountableManager,
                QualityManager = shop.QualityManager,
                IsActive = shop.IsActive,
                CreatedAt = shop.CreatedAt,
                UpdatedAt = shop.UpdatedAt
            };
        }

        // Component Handlers
        public async Task<List<ComponentDto>> Handle(GetComponentsByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.Components
                .Where(c => c.ShopId == request.ShopId && c.IsActive)
                .Include(c => c.ATAChapter)
                .Select(c => new ComponentDto
                {
                    Id = c.Id,
                    PartNumber = c.PartNumber,
                    Description = c.Description,
                    Manufacturer = c.Manufacturer,
                    ModelSeries = c.ModelSeries,
                    ATAChapterId = c.ATAChapterId,
                    ATAChapterNumber = c.ATAChapter.ChapterNumber,
                    ATAChapterTitle = c.ATAChapter.Title,
                    ShopId = c.ShopId,
                    IsActive = c.IsActive,
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<ComponentDto?> Handle(GetComponentByIdQuery request, CancellationToken cancellationToken)
        {
            return await _context.Components
                .Where(c => c.Id == request.Id)
                .Include(c => c.ATAChapter)
                .Select(c => new ComponentDto
                {
                    Id = c.Id,
                    PartNumber = c.PartNumber,
                    Description = c.Description,
                    Manufacturer = c.Manufacturer,
                    ModelSeries = c.ModelSeries,
                    ATAChapterId = c.ATAChapterId,
                    ATAChapterNumber = c.ATAChapter.ChapterNumber,
                    ATAChapterTitle = c.ATAChapter.Title,
                    ShopId = c.ShopId,
                    IsActive = c.IsActive,
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt
                })
                .FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<List<ComponentDto>> Handle(GetComponentsByATAChapterQuery request, CancellationToken cancellationToken)
        {
            return await _context.Components
                .Where(c => c.ATAChapterId == request.ATAChapterId && c.IsActive)
                .Include(c => c.ATAChapter)
                .Select(c => new ComponentDto
                {
                    Id = c.Id,
                    PartNumber = c.PartNumber,
                    Description = c.Description,
                    Manufacturer = c.Manufacturer,
                    ModelSeries = c.ModelSeries,
                    ATAChapterId = c.ATAChapterId,
                    ATAChapterNumber = c.ATAChapter.ChapterNumber,
                    ATAChapterTitle = c.ATAChapter.Title,
                    ShopId = c.ShopId,
                    IsActive = c.IsActive,
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt
                })
                .ToListAsync(cancellationToken);
        }

        // Capability Assessment Handlers
        public async Task<List<CapabilityAssessmentDto>> Handle(GetCapabilityAssessmentsByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.CapabilityAssessments
                .Where(ca => ca.ShopId == request.ShopId)
                .Include(ca => ca.Component)
                .Select(ca => new CapabilityAssessmentDto
                {
                    Id = ca.Id,
                    ComponentId = ca.ComponentId,
                    ComponentPartNumber = ca.Component.PartNumber,
                    ComponentDescription = ca.Component.Description,
                    ShopId = ca.ShopId,
                    Status = ca.Status,
                    Justification = ca.Justification,
                    HasRequiredTooling = ca.HasRequiredTooling,
                    HasRequiredTraining = ca.HasRequiredTraining,
                    HasTechnicalData = ca.HasTechnicalData,
                    HasRequiredFacilities = ca.HasRequiredFacilities,
                    Limitations = ca.Limitations,
                    CorrectiveActions = ca.CorrectiveActions,
                    AssessmentDate = ca.AssessmentDate,
                    NextReviewDate = ca.NextReviewDate,
                    AssessedBy = ca.AssessedBy,
                    ApprovedBy = ca.ApprovedBy
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<CapabilityAssessmentDto?> Handle(GetCapabilityAssessmentByIdQuery request, CancellationToken cancellationToken)
        {
            return await _context.CapabilityAssessments
                .Where(ca => ca.Id == request.Id)
                .Include(ca => ca.Component)
                .Select(ca => new CapabilityAssessmentDto
                {
                    Id = ca.Id,
                    ComponentId = ca.ComponentId,
                    ComponentPartNumber = ca.Component.PartNumber,
                    ComponentDescription = ca.Component.Description,
                    ShopId = ca.ShopId,
                    Status = ca.Status,
                    Justification = ca.Justification,
                    HasRequiredTooling = ca.HasRequiredTooling,
                    HasRequiredTraining = ca.HasRequiredTraining,
                    HasTechnicalData = ca.HasTechnicalData,
                    HasRequiredFacilities = ca.HasRequiredFacilities,
                    Limitations = ca.Limitations,
                    CorrectiveActions = ca.CorrectiveActions,
                    AssessmentDate = ca.AssessmentDate,
                    NextReviewDate = ca.NextReviewDate,
                    AssessedBy = ca.AssessedBy,
                    ApprovedBy = ca.ApprovedBy
                })
                .FirstOrDefaultAsync(cancellationToken);
        }

        public async Task<List<CapabilityAssessmentDto>> Handle(GetCapabilityAssessmentsByStatusQuery request, CancellationToken cancellationToken)
        {
            return await _context.CapabilityAssessments
                .Where(ca => ca.ShopId == request.ShopId && ca.Status == request.Status)
                .Include(ca => ca.Component)
                .Select(ca => new CapabilityAssessmentDto
                {
                    Id = ca.Id,
                    ComponentId = ca.ComponentId,
                    ComponentPartNumber = ca.Component.PartNumber,
                    ComponentDescription = ca.Component.Description,
                    ShopId = ca.ShopId,
                    Status = ca.Status,
                    Justification = ca.Justification,
                    HasRequiredTooling = ca.HasRequiredTooling,
                    HasRequiredTraining = ca.HasRequiredTraining,
                    HasTechnicalData = ca.HasTechnicalData,
                    HasRequiredFacilities = ca.HasRequiredFacilities,
                    Limitations = ca.Limitations,
                    CorrectiveActions = ca.CorrectiveActions,
                    AssessmentDate = ca.AssessmentDate,
                    NextReviewDate = ca.NextReviewDate,
                    AssessedBy = ca.AssessedBy,
                    ApprovedBy = ca.ApprovedBy
                })
                .ToListAsync(cancellationToken);
        }

        // Technical Data Handlers
        public async Task<List<TechnicalDataDto.AirworthinessDirectiveDto>> Handle(GetAirworthinessDirectivesByComponentQuery request, CancellationToken cancellationToken)
        {
            return await _context.AirworthinessDirectives
                .Where(ad => ad.ComponentId == request.ComponentId)
                .Select(ad => new TechnicalDataDto.AirworthinessDirectiveDto
                {
                    Id = ad.Id,
                    ADNumber = ad.ADNumber,
                    Title = ad.Title,
                    Description = ad.Description,
                    EffectiveDate = ad.EffectiveDate,
                    Applicability = ad.Applicability,
                    ComplianceStatus = ad.ComplianceStatus,
                    ComplianceMethod = ad.ComplianceMethod,
                    Notes = ad.Notes,
                    ComponentId = ad.ComponentId
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<List<TechnicalDataDto.ServiceBulletinDto>> Handle(GetServiceBulletinsByComponentQuery request, CancellationToken cancellationToken)
        {
            return await _context.ServiceBulletins
                .Where(sb => sb.ComponentId == request.ComponentId)
                .Select(sb => new TechnicalDataDto.ServiceBulletinDto
                {
                    Id = sb.Id,
                    SBNumber = sb.SBNumber,
                    Title = sb.Title,
                    Description = sb.Description,
                    IssueDate = sb.IssueDate,
                    RevisionDate = sb.RevisionDate,
                    Revision = sb.Revision,
                    Category = sb.Category,
                    ComplianceStatus = sb.ComplianceStatus,
                    ComplianceNotes = sb.ComplianceNotes,
                    ComponentId = sb.ComponentId
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<List<TechnicalDataDto.ToolNeedsAnalysisDto>> Handle(GetToolNeedsAnalysisByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.ToolNeedsAnalyses
                .Where(t => t.ShopId == request.ShopId)
                .Include(t => t.Component)
                .Select(t => new TechnicalDataDto.ToolNeedsAnalysisDto
                {
                    Id = t.Id,
                    ToolName = t.ToolName,
                    ToolPartNumber = t.ToolPartNumber,
                    Description = t.Description,
                    Manufacturer = t.Manufacturer,
                    Status = t.Status,
                    CalibrationDueDate = t.CalibrationDueDate,
                    CalibrationInterval = t.CalibrationInterval,
                    StorageLocation = t.StorageLocation,
                    QuantityRequired = t.QuantityRequired,
                    QuantityAvailable = t.QuantityAvailable,
                    ComponentId = t.ComponentId,
                    ComponentPartNumber = t.Component.PartNumber,
                    ShopId = t.ShopId
                })
                .ToListAsync(cancellationToken);
        }

        // Audit Handlers
        public async Task<List<SelfAuditChecklistDto>> Handle(GetSelfAuditChecklistByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.SelfAuditChecklists
                .Where(c => c.ShopId == request.ShopId)
                .Select(c => new SelfAuditChecklistDto
                {
                    Id = c.Id,
                    Section = c.Section,
                    ItemNumber = c.ItemNumber,
                    Question = c.Question,
                    RegulatoryReference = c.RegulatoryReference,
                    ComplianceStatus = c.ComplianceStatus,
                    Findings = c.Findings,
                    CorrectiveAction = c.CorrectiveAction,
                    DueDate = c.DueDate,
                    CompletionDate = c.CompletionDate,
                    AssignedTo = c.AssignedTo,
                    AuditStatus = c.AuditStatus,
                    ShopId = c.ShopId
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<List<SelfAuditChecklistDto>> Handle(GetSelfAuditChecklistByStatusQuery request, CancellationToken cancellationToken)
        {
            return await _context.SelfAuditChecklists
                .Where(c => c.ShopId == request.ShopId && c.AuditStatus == request.Status)
                .Select(c => new SelfAuditChecklistDto
                {
                    Id = c.Id,
                    Section = c.Section,
                    ItemNumber = c.ItemNumber,
                    Question = c.Question,
                    RegulatoryReference = c.RegulatoryReference,
                    ComplianceStatus = c.ComplianceStatus,
                    Findings = c.Findings,
                    CorrectiveAction = c.CorrectiveAction,
                    DueDate = c.DueDate,
                    CompletionDate = c.CompletionDate,
                    AssignedTo = c.AssignedTo,
                    AuditStatus = c.AuditStatus,
                    ShopId = c.ShopId
                })
                .ToListAsync(cancellationToken);
        }

        // Employee Proficiency Handler
        public async Task<List<EmployeeProficiencyDto>> Handle(GetEmployeeProficiencyByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.EmployeeProficiencyRecords
                .Where(e => e.ShopId == request.ShopId && e.IsActive)
                .Select(e => new EmployeeProficiencyDto
                {
                    Id = e.Id,
                    EmployeeName = e.EmployeeName,
                    EmployeeId = e.EmployeeId,
                    JobTitle = e.JobTitle,
                    Department = e.Department,
                    Certifications = e.Certifications,
                    ProficiencyLevel = e.ProficiencyLevel,
                    SkillAreas = e.SkillAreas,
                    LastTrainingDate = e.LastTrainingDate,
                    NextTrainingDue = e.NextTrainingDue,
                    TrainingHistory = e.TrainingHistory,
                    IsActive = e.IsActive,
                    ShopId = e.ShopId
                })
                .ToListAsync(cancellationToken);
        }

        // Workflow Audit Log Handlers
        public async Task<List<WorkflowAuditLogDto>> Handle(GetWorkflowAuditLogsByEntityQuery request, CancellationToken cancellationToken)
        {
            return await _context.WorkflowAuditLogs
                .Where(l => l.EntityType == request.EntityType && l.EntityId == request.EntityId)
                .OrderByDescending(l => l.Timestamp)
                .Select(l => new WorkflowAuditLogDto
                {
                    Id = l.Id,
                    Action = l.Action,
                    WorkflowAction = l.WorkflowAction,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    PerformedBy = l.PerformedBy,
                    UserRole = l.UserRole,
                    Details = l.Details,
                    PreviousValues = l.PreviousValues,
                    NewValues = l.NewValues,
                    Timestamp = l.Timestamp
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<List<WorkflowAuditLogDto>> Handle(GetRecentWorkflowAuditLogsQuery request, CancellationToken cancellationToken)
        {
            return await _context.WorkflowAuditLogs
                .OrderByDescending(l => l.Timestamp)
                .Take(request.Count)
                .Select(l => new WorkflowAuditLogDto
                {
                    Id = l.Id,
                    Action = l.Action,
                    WorkflowAction = l.WorkflowAction,
                    EntityType = l.EntityType,
                    EntityId = l.EntityId,
                    PerformedBy = l.PerformedBy,
                    UserRole = l.UserRole,
                    Details = l.Details,
                    PreviousValues = l.PreviousValues,
                    NewValues = l.NewValues,
                    Timestamp = l.Timestamp
                })
                .ToListAsync(cancellationToken);
        }

        // Delegation Handler
        public async Task<List<ResponsibilityDelegationDto>> Handle(GetDelegationsByShopQuery request, CancellationToken cancellationToken)
        {
            return await _context.ResponsibilityDelegations
                .Where(d => d.ShopId == request.ShopId && d.Status == DelegationStatus.Active)
                .Select(d => new ResponsibilityDelegationDto
                {
                    Id = d.Id,
                    DelegatedBy = d.DelegatedBy,
                    DelegatedTo = d.DelegatedTo,
                    Responsibility = d.Responsibility,
                    Scope = d.Scope,
                    Status = d.Status,
                    EffectiveDate = d.EffectiveDate,
                    ExpirationDate = d.ExpirationDate,
                    ShopId = d.ShopId
                })
                .ToListAsync(cancellationToken);
        }

        // Dashboard Summary Handler
        public async Task<ShopDashboardSummaryDto> Handle(GetShopDashboardSummaryQuery request, CancellationToken cancellationToken)
        {
            var shop = await _context.Shops.FindAsync(new object[] { request.ShopId }, cancellationToken);

            var totalComponents = await _context.Components
                .CountAsync(c => c.ShopId == request.ShopId && c.IsActive, cancellationToken);

            var assessments = await _context.CapabilityAssessments
                .Where(ca => ca.ShopId == request.ShopId)
                .GroupBy(ca => ca.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken);

            var pendingAuditItems = await _context.SelfAuditChecklists
                .CountAsync(c => c.ShopId == request.ShopId &&
                    (c.AuditStatus == AuditStatus.NotStarted || c.AuditStatus == AuditStatus.InProgress),
                    cancellationToken);

            var overdueAuditItems = await _context.SelfAuditChecklists
                .CountAsync(c => c.ShopId == request.ShopId &&
                    c.DueDate < DateTime.UtcNow &&
                    c.AuditStatus != AuditStatus.Completed &&
                    c.AuditStatus != AuditStatus.Closed,
                    cancellationToken);

            var activeEmployees = await _context.EmployeeProficiencyRecords
                .CountAsync(e => e.ShopId == request.ShopId && e.IsActive, cancellationToken);

            var toolsNeedingCalibration = await _context.ToolNeedsAnalyses
                .CountAsync(t => t.ShopId == request.ShopId &&
                    t.CalibrationDueDate <= DateTime.UtcNow.AddDays(30),
                    cancellationToken);

            var activeDelegations = await _context.ResponsibilityDelegations
                .CountAsync(d => d.ShopId == request.ShopId && d.Status == DelegationStatus.Active,
                    cancellationToken);

            return new ShopDashboardSummaryDto
            {
                ShopId = request.ShopId,
                ShopName = shop?.Name ?? string.Empty,
                TotalComponents = totalComponents,
                FullCapabilityCount = assessments.FirstOrDefault(a => a.Status == CapabilityStatus.FullCapability)?.Count ?? 0,
                LimitedCapabilityCount = assessments.FirstOrDefault(a => a.Status == CapabilityStatus.LimitedCapability)?.Count ?? 0,
                NoCapabilityCount = assessments.FirstOrDefault(a => a.Status == CapabilityStatus.NoCapability)?.Count ?? 0,
                PendingAuditItems = pendingAuditItems,
                OverdueAuditItems = overdueAuditItems,
                ActiveEmployees = activeEmployees,
                ToolsNeedingCalibration = toolsNeedingCalibration,
                ActiveDelegations = activeDelegations
            };
        }
    }
}
