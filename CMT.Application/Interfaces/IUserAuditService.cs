namespace CMT.Application.Interfaces
{
    public interface IUserAuditService
    {
        System.Threading.Tasks.Task LogUserActionAsync(
            string actionType,
            int targetUserId,
            int performedByUserId,
            string? changesMade = null,
            string? reason = null,
            string? ipAddress = null);

        System.Threading.Tasks.Task<List<UserAuditLogDto>> GetAuditLogsAsync(int? userId = null, DateTime? fromDate = null, DateTime? toDate = null);

        // New method for paginated user-specific audit logs
        System.Threading.Tasks.Task<List<UserAuditLogDto>> GetUserAuditLogsAsync(int userId, int page = 1, int pageSize = 50);
    }

    public class UserAuditLogDto
    {
        public int AuditId { get; set; }
        public string ActionType { get; set; } = string.Empty;
        public int TargetUserId { get; set; }
        public string? TargetUsername { get; set; }
        public string? TargetUserRole { get; set; }
        public int PerformedByUserId { get; set; }
        public string? PerformedByUsername { get; set; }
        public string? PerformedByRole { get; set; }
        public string? ChangesMade { get; set; }
        public string? Reason { get; set; }
        public string? IpAddress { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}