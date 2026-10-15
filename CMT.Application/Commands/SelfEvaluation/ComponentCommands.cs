using System;
using MediatR;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    public class CreateComponentCommand : IRequest<Guid>
    {
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Manufacturer { get; set; } = string.Empty;
        public string ModelSeries { get; set; } = string.Empty;
        public Guid ATAChapterId { get; set; }
        public Guid ShopId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateComponentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Manufacturer { get; set; } = string.Empty;
        public string ModelSeries { get; set; } = string.Empty;
        public Guid ATAChapterId { get; set; }
        public Guid ShopId { get; set; }
        public bool IsActive { get; set; }
        public string UpdatedBy { get; set; } = string.Empty;
    }

    public class DeleteComponentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }
}