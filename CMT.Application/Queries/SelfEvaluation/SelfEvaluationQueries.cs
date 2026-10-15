using System;
using System.Collections.Generic;
using MediatR;
using CMT.Application.SelfEvaluation.DTO.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Queries.SelfEvaluation
{
    // Shop Queries
    public class GetAllShopsQuery : IRequest<List<ShopDto>> { }

    public class GetShopByIdQuery : IRequest<ShopDto?>
    {
        public Guid Id { get; set; }
    }

    // Component Queries
    public class GetComponentsByShopQuery : IRequest<List<ComponentDto>>
    {
        public Guid ShopId { get; set; }
    }

    public class GetComponentByIdQuery : IRequest<ComponentDto?>
    {
        public Guid Id { get; set; }
    }

    public class GetComponentsByATAChapterQuery : IRequest<List<ComponentDto>>
    {
        public Guid ATAChapterId { get; set; }
    }

    // Capability Assessment Queries
    public class GetCapabilityAssessmentsByShopQuery : IRequest<List<CapabilityAssessmentDto>>
    {
        public Guid ShopId { get; set; }
    }

    public class GetCapabilityAssessmentByIdQuery : IRequest<CapabilityAssessmentDto?>
    {
        public Guid Id { get; set; }
    }

    public class GetCapabilityAssessmentsByStatusQuery : IRequest<List<CapabilityAssessmentDto>>
    {
        public Guid ShopId { get; set; }
        public CapabilityStatus Status { get; set; }
    }

    // Technical Data Queries
    public class GetAirworthinessDirectivesByComponentQuery : IRequest<List<TechnicalDataDto.AirworthinessDirectiveDto>>
    {
        public Guid ComponentId { get; set; }
    }

    public class GetServiceBulletinsByComponentQuery : IRequest<List<TechnicalDataDto.ServiceBulletinDto>>
    {
        public Guid ComponentId { get; set; }
    }

    public class GetToolNeedsAnalysisByShopQuery : IRequest<List<TechnicalDataDto.ToolNeedsAnalysisDto>>
    {
        public Guid ShopId { get; set; }
    }

    // Audit Queries
    public class GetSelfAuditChecklistByShopQuery : IRequest<List<SelfAuditChecklistDto>>
    {
        public Guid ShopId { get; set; }
    }

    public class GetSelfAuditChecklistByStatusQuery : IRequest<List<SelfAuditChecklistDto>>
    {
        public Guid ShopId { get; set; }
        public AuditStatus Status { get; set; }
    }

    // Employee Proficiency Queries
    public class GetEmployeeProficiencyByShopQuery : IRequest<List<EmployeeProficiencyDto>>
    {
        public Guid ShopId { get; set; }
    }

    // Workflow Audit Log Queries
    public class GetWorkflowAuditLogsByEntityQuery : IRequest<List<WorkflowAuditLogDto>>
    {
        public string EntityType { get; set; } = string.Empty;
        public Guid EntityId { get; set; }
    }

    public class GetRecentWorkflowAuditLogsQuery : IRequest<List<WorkflowAuditLogDto>>
    {
        public int Count { get; set; } = 50;
    }

    // Responsibility Delegation Queries
    public class GetDelegationsByShopQuery : IRequest<List<ResponsibilityDelegationDto>>
    {
        public Guid ShopId { get; set; }
    }

    // Dashboard / Summary Queries
    public class GetShopDashboardSummaryQuery : IRequest<ShopDashboardSummaryDto>
    {
        public Guid ShopId { get; set; }
    }

    // DTOs for queries not in separate files
    public class ComponentDto
    {
        public Guid Id { get; set; }
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Manufacturer { get; set; } = string.Empty;
        public string ModelSeries { get; set; } = string.Empty;
        public Guid ATAChapterId { get; set; }
        public string ATAChapterNumber { get; set; } = string.Empty;
        public string ATAChapterTitle { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class EmployeeProficiencyDto
    {
        public Guid Id { get; set; }
        public string EmployeeName { get; set; } = string.Empty;
        public string EmployeeId { get; set; } = string.Empty;
        public string JobTitle { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string Certifications { get; set; } = string.Empty;
        public ProficiencyLevel ProficiencyLevel { get; set; }
        public string SkillAreas { get; set; } = string.Empty;
        public DateTime? LastTrainingDate { get; set; }
        public DateTime? NextTrainingDue { get; set; }
        public string TrainingHistory { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public Guid ShopId { get; set; }
    }

    public class WorkflowAuditLogDto
    {
        public Guid Id { get; set; }
        public string Action { get; set; } = string.Empty;
        public WorkflowAction WorkflowAction { get; set; }
        public string EntityType { get; set; } = string.Empty;
        public Guid EntityId { get; set; }
        public string PerformedBy { get; set; } = string.Empty;
        /// <summary>
        /// Role of the user who performed the action (e.g., Manager, Engineer, STL, Director).
        /// Helps identify the authority level and context of the action.
        /// </summary>
        public string UserRole { get; set; } = string.Empty;
        public string Details { get; set; } = string.Empty;
        /// <summary>
        /// JSON representation of the previous state/values before the change.
        /// </summary>
        public string PreviousValues { get; set; } = string.Empty;
        /// <summary>
        /// JSON representation of the new state/values after the change.
        /// </summary>
        public string NewValues { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }

    public class ResponsibilityDelegationDto
    {
        public Guid Id { get; set; }
        public string DelegatedBy { get; set; } = string.Empty;
        public string DelegatedTo { get; set; } = string.Empty;
        public string Responsibility { get; set; } = string.Empty;
        public string Scope { get; set; } = string.Empty;
        public DelegationStatus Status { get; set; }
        public DateTime EffectiveDate { get; set; }
        public DateTime? ExpirationDate { get; set; }
        public Guid ShopId { get; set; }
    }

    public class ShopDashboardSummaryDto
    {
        public Guid ShopId { get; set; }
        public string ShopName { get; set; } = string.Empty;
        public int TotalComponents { get; set; }
        public int FullCapabilityCount { get; set; }
        public int LimitedCapabilityCount { get; set; }
        public int NoCapabilityCount { get; set; }
        public int PendingAuditItems { get; set; }
        public int OverdueAuditItems { get; set; }
        public int ActiveEmployees { get; set; }
        public int ToolsNeedingCalibration { get; set; }
        public int ActiveDelegations { get; set; }
    }
}
