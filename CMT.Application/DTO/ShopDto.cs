using System;

namespace CMT.Application.SelfEvaluation.DTO.SelfEvaluation
{
    public class ShopDto
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
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
