namespace CMT.Application.DTOs
{
    /// <summary>
    /// Lightweight DTO for engineer dropdown lists - contains only essential fields for performance
    /// </summary>
    public class EngineerDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public bool IsActive { get; set; }
    }
}