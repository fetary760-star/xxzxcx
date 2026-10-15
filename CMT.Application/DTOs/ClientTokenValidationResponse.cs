namespace CMT.Application.DTOs
{
    public class ClientTokenValidationResponse
    {
        public string ClientId { get; set; } = string.Empty;
        public bool RequireuserToken { get; set; }
    }
}