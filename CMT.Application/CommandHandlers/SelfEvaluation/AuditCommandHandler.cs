using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class AuditCommandHandler :
        IRequestHandler<CreateSelfAuditChecklistCommand, Guid>,
        IRequestHandler<UpdateSelfAuditChecklistCommand, bool>,
        IRequestHandler<CreateEmployeeProficiencyRecordCommand, Guid>,
        IRequestHandler<UpdateEmployeeProficiencyRecordCommand, bool>,
        IRequestHandler<CreateResponsibilityDelegationCommand, Guid>,
        IRequestHandler<UpdateResponsibilityDelegationCommand, bool>,
        IRequestHandler<CreateWorkflowAuditLogCommand, Guid>
    {
        private readonly ApplicationDbContext _context;

        public AuditCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        // Self-Audit Checklist Handlers
        public async Task<Guid> Handle(CreateSelfAuditChecklistCommand request, CancellationToken cancellationToken)
        {
            var checklist = new SelfAuditChecklist
            {
                Id = Guid.NewGuid(),
                Section = request.Section,
                ItemNumber = request.ItemNumber,
                Question = request.Question,
                RegulatoryReference = request.RegulatoryReference,
                ComplianceStatus = request.ComplianceStatus,
                Findings = request.Findings,
                CorrectiveAction = request.CorrectiveAction,
                DueDate = request.DueDate,
                AssignedTo = request.AssignedTo,
                AuditStatus = AuditStatus.NotStarted,
                ShopId = request.ShopId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.SelfAuditChecklists.Add(checklist);
            await _context.SaveChangesAsync(cancellationToken);

            return checklist.Id;
        }

        public async Task<bool> Handle(UpdateSelfAuditChecklistCommand request, CancellationToken cancellationToken)
        {
            var checklist = await _context.SelfAuditChecklists.FindAsync(new object[] { request.Id }, cancellationToken);
            if (checklist == null) return false;

            checklist.ComplianceStatus = request.ComplianceStatus;
            checklist.Findings = request.Findings;
            checklist.CorrectiveAction = request.CorrectiveAction;
            checklist.DueDate = request.DueDate;
            checklist.CompletionDate = request.CompletionDate;
            checklist.AssignedTo = request.AssignedTo;
            checklist.AuditStatus = request.AuditStatus;
            checklist.UpdatedAt = DateTime.UtcNow;
            checklist.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // Employee Proficiency Handlers
        public async Task<Guid> Handle(CreateEmployeeProficiencyRecordCommand request, CancellationToken cancellationToken)
        {
            var record = new EmployeeProficiencyRecord
            {
                Id = Guid.NewGuid(),
                EmployeeName = request.EmployeeName,
                EmployeeId = request.EmployeeId,
                JobTitle = request.JobTitle,
                Department = request.Department,
                Certifications = request.Certifications,
                ProficiencyLevel = request.ProficiencyLevel,
                SkillAreas = request.SkillAreas,
                LastTrainingDate = request.LastTrainingDate,
                NextTrainingDue = request.NextTrainingDue,
                TrainingHistory = request.TrainingHistory,
                Notes = request.Notes,
                IsActive = true,
                ShopId = request.ShopId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.EmployeeProficiencyRecords.Add(record);
            await _context.SaveChangesAsync(cancellationToken);

            return record.Id;
        }

        public async Task<bool> Handle(UpdateEmployeeProficiencyRecordCommand request, CancellationToken cancellationToken)
        {
            var record = await _context.EmployeeProficiencyRecords.FindAsync(new object[] { request.Id }, cancellationToken);
            if (record == null) return false;

            record.JobTitle = request.JobTitle;
            record.Department = request.Department;
            record.Certifications = request.Certifications;
            record.ProficiencyLevel = request.ProficiencyLevel;
            record.SkillAreas = request.SkillAreas;
            record.LastTrainingDate = request.LastTrainingDate;
            record.NextTrainingDue = request.NextTrainingDue;
            record.TrainingHistory = request.TrainingHistory;
            record.Notes = request.Notes;
            record.IsActive = request.IsActive;
            record.UpdatedAt = DateTime.UtcNow;
            record.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // Responsibility Delegation Handlers
        public async Task<Guid> Handle(CreateResponsibilityDelegationCommand request, CancellationToken cancellationToken)
        {
            var delegation = new ResponsibilityDelegation
            {
                Id = Guid.NewGuid(),
                DelegatedBy = request.DelegatedBy,
                DelegatedTo = request.DelegatedTo,
                Responsibility = request.Responsibility,
                Scope = request.Scope,
                Conditions = request.Conditions,
                Status = DelegationStatus.Active,
                EffectiveDate = request.EffectiveDate,
                ExpirationDate = request.ExpirationDate,
                Notes = request.Notes,
                ShopId = request.ShopId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.ResponsibilityDelegations.Add(delegation);
            await _context.SaveChangesAsync(cancellationToken);

            return delegation.Id;
        }

        public async Task<bool> Handle(UpdateResponsibilityDelegationCommand request, CancellationToken cancellationToken)
        {
            var delegation = await _context.ResponsibilityDelegations.FindAsync(new object[] { request.Id }, cancellationToken);
            if (delegation == null) return false;

            delegation.Responsibility = request.Responsibility;
            delegation.Scope = request.Scope;
            delegation.Conditions = request.Conditions;
            delegation.Status = request.Status;
            delegation.ExpirationDate = request.ExpirationDate;
            delegation.Notes = request.Notes;
            delegation.UpdatedAt = DateTime.UtcNow;
            delegation.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        // Workflow Audit Log Handler
        public async Task<Guid> Handle(CreateWorkflowAuditLogCommand request, CancellationToken cancellationToken)
        {
            var log = new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = request.Action,
                WorkflowAction = request.WorkflowAction,
                EntityType = request.EntityType,
                EntityId = request.EntityId,
                PerformedBy = request.PerformedBy,
                Details = request.Details,
                PreviousValues = request.PreviousValues,
                NewValues = request.NewValues,
                IpAddress = request.IpAddress,
                Timestamp = DateTime.UtcNow
            };

            _context.WorkflowAuditLogs.Add(log);
            await _context.SaveChangesAsync(cancellationToken);

            return log.Id;
        }
    }
}