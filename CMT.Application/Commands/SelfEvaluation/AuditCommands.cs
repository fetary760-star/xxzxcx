using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    // Self-Audit Checklist Commands
    public class CreateSelfAuditChecklistCommand : IRequest<Guid>
    {
        public string Section { get; set; } = string.Empty;
        public string ItemNumber { get; set; } = string.Empty;
        public string Question { get; set; } = string.Empty;
        public string RegulatoryReference { get; set; } = string.Empty;
        public ComplianceStatus ComplianceStatus { get; set; }
        public string Findings { get; set; } = string.Empty;
        public string CorrectiveAction { get; set; } = string.Empty;
        public DateTime? DueDate { get; set; }
        public string AssignedTo { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateSelfAuditChecklistCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public ComplianceStatus ComplianceStatus { get; set; }
        public string Findings { get; set; } = string.Empty;
        public string CorrectiveAction { get; set; } = string.Empty;
        public DateTime? DueDate { get; set; }
        public DateTime? CompletionDate { get; set; }
        public string AssignedTo { get; set; } = string.Empty;
        public AuditStatus AuditStatus { get; set; }
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // Employee Proficiency Commands
    public class CreateEmployeeProficiencyRecordCommand : IRequest<Guid>
    {
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
        public string Notes { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateEmployeeProficiencyRecordCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string JobTitle { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string Certifications { get; set; } = string.Empty;
        public ProficiencyLevel ProficiencyLevel { get; set; }
        public string SkillAreas { get; set; } = string.Empty;
        public DateTime? LastTrainingDate { get; set; }
        public DateTime? NextTrainingDue { get; set; }
        public string TrainingHistory { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // Responsibility Delegation Commands
    public class CreateResponsibilityDelegationCommand : IRequest<Guid>
    {
        public string DelegatedBy { get; set; } = string.Empty;
        public string DelegatedTo { get; set; } = string.Empty;
        public string Responsibility { get; set; } = string.Empty;
        public string Scope { get; set; } = string.Empty;
        public string Conditions { get; set; } = string.Empty;
        public DateTime EffectiveDate { get; set; }
        public DateTime? ExpirationDate { get; set; }
        public string Notes { get; set; } = string.Empty;
        public Guid ShopId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateResponsibilityDelegationCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string Responsibility { get; set; } = string.Empty;
        public string Scope { get; set; } = string.Empty;
        public string Conditions { get; set; } = string.Empty;
        public DelegationStatus Status { get; set; }
        public DateTime? ExpirationDate { get; set; }
        public string Notes { get; set; } = string.Empty;
        public string UpdatedBy { get; set; } = string.Empty;
    }

    // Workflow Audit Log Command
    public class CreateWorkflowAuditLogCommand : IRequest<Guid>
    {
        public string Action { get; set; } = string.Empty;
        public WorkflowAction WorkflowAction { get; set; }
        public string EntityType { get; set; } = string.Empty;
        public Guid EntityId { get; set; }
        public string PerformedBy { get; set; } = string.Empty;
        public string Details { get; set; } = string.Empty;
        public string PreviousValues { get; set; } = string.Empty;
        public string NewValues { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
    }
}