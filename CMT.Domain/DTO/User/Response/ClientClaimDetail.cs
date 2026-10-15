using CMT.Domain.Models;

namespace Template.Api.Contracts.User.Response
{
    public class ClientClaimDetail
    {
        public long Id { get; set; }
        public required string Name { get; set; }
        public required string Claim { get; set; }
        public required string Description { get; set; }
        public long ClientId { get; set; }
        public RecordStatus RecordStatus { get; set; }
    }
}