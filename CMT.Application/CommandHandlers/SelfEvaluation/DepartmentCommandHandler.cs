using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class DepartmentCommandHandler :
        IRequestHandler<CreateDepartmentCommand, Guid>,
        IRequestHandler<UpdateDepartmentCommand, bool>,
        IRequestHandler<DeleteDepartmentCommand, bool>
    {
        private readonly ApplicationDbContext _context;

        public DepartmentCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Guid> Handle(CreateDepartmentCommand request, CancellationToken cancellationToken)
        {
            var department = new Department
            {
                Id = Guid.NewGuid(),
                Name = request.Name,
                Code = request.Code,
                Description = request.Description ?? string.Empty,
                DirectorUserId = request.DirectorUserId,
                ParentDepartmentId = request.ParentDepartmentId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.Departments.Add(department);
            await _context.SaveChangesAsync(cancellationToken);

            return department.Id;
        }

        public async Task<bool> Handle(UpdateDepartmentCommand request, CancellationToken cancellationToken)
        {
            var department = await _context.Departments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (department == null) return false;

            department.Name = request.Name;
            department.Code = request.Code;
            department.Description = request.Description ?? string.Empty;
            department.DirectorUserId = request.DirectorUserId;
            department.ParentDepartmentId = request.ParentDepartmentId;
            department.IsActive = request.IsActive;
            department.UpdatedAt = DateTime.UtcNow;
            department.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DeleteDepartmentCommand request, CancellationToken cancellationToken)
        {
            var department = await _context.Departments.FindAsync(new object[] { request.Id }, cancellationToken);
            if (department == null) return false;

            department.IsActive = false;
            department.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}