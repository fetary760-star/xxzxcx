using System;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    public class ComponentCommandHandler :
        IRequestHandler<CreateComponentCommand, Guid>,
        IRequestHandler<UpdateComponentCommand, bool>,
        IRequestHandler<DeleteComponentCommand, bool>
    {
        private readonly ApplicationDbContext _context;

        public ComponentCommandHandler(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<Guid> Handle(CreateComponentCommand request, CancellationToken cancellationToken)
        {
            var component = new Component
            {
                Id = Guid.NewGuid(),
                PartNumber = request.PartNumber,
                Description = request.Description,
                Manufacturer = request.Manufacturer,
                ModelSeries = request.ModelSeries,
                ATAChapterId = request.ATAChapterId,
                ShopId = request.ShopId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = request.CreatedBy,
                UpdatedBy = request.CreatedBy
            };

            _context.Components.Add(component);
            await _context.SaveChangesAsync(cancellationToken);

            return component.Id;
        }

        public async Task<bool> Handle(UpdateComponentCommand request, CancellationToken cancellationToken)
        {
            var component = await _context.Components.FindAsync(new object[] { request.Id }, cancellationToken);
            if (component == null) return false;

            component.PartNumber = request.PartNumber;
            component.Description = request.Description;
            component.Manufacturer = request.Manufacturer;
            component.ModelSeries = request.ModelSeries;
            component.ATAChapterId = request.ATAChapterId;
            component.ShopId = request.ShopId;
            component.IsActive = request.IsActive;
            component.UpdatedAt = DateTime.UtcNow;
            component.UpdatedBy = request.UpdatedBy;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DeleteComponentCommand request, CancellationToken cancellationToken)
        {
            var component = await _context.Components.FindAsync(new object[] { request.Id }, cancellationToken);
            if (component == null) return false;

            component.IsActive = false;
            component.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}