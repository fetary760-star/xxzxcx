using System;
using MediatR;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    public class CreateShopCommand : IRequest<Guid>
    {
        public string Name { get; set; } = string.Empty;
        public string CertificateNumber { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string City { get; set; } = string.Empty;
        public string State { get; set; } = string.Empty;
        public string ZipCode { get; set; } = string.Empty;
        public string Country { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string AccountableManager { get; set; } = string.Empty;
        public string QualityManager { get; set; } = string.Empty;
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class UpdateShopCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string CertificateNumber { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string City { get; set; } = string.Empty;
        public string State { get; set; } = string.Empty;
        public string ZipCode { get; set; } = string.Empty;
        public string Country { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string AccountableManager { get; set; } = string.Empty;
        public string QualityManager { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public string UpdatedBy { get; set; } = string.Empty;
    }

    public class DeleteShopCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }
}
