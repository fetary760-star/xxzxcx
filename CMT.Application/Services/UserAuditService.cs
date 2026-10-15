using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace CMT.Application.Services
{
    public class UserAuditService : IUserAuditService
    {
        private readonly ApplicationDbContext _context;

        public UserAuditService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async System.Threading.Tasks.Task LogUserActionAsync(
            string actionType,
            int targetUserId,
            int performedByUserId,
            string? changesMade = null,
            string? reason = null,
            string? ipAddress = null)
        {
            var targetUser = await _context.Users.FindAsync(targetUserId);
            var performedByUser = await _context.Users.FindAsync(performedByUserId);

            var auditLog = new UserAuditLog
            {
                ActionType = actionType,
                TargetUserId = targetUserId,
                TargetUsername = targetUser?.Username,
                TargetUserRole = targetUser != null ? ConvertUserRoleToString(targetUser.Role) : null,
                PerformedByUserId = performedByUserId,
                PerformedByUsername = performedByUser?.Username,
                PerformedByRole = performedByUser != null ? ConvertUserRoleToString(performedByUser.Role) : null,
                ChangesMade = changesMade,
                Reason = reason,
                IpAddress = ipAddress,
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = performedByUser?.Username ?? "System",
                RegisteredDate = DateTime.UtcNow,
                LastUpdateDate = DateTime.UtcNow,
                UpdatedBy = performedByUser?.Username ?? "System",
                StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.Add(auditLog);
            await _context.SaveChangesAsync();
        }

        public async System.Threading.Tasks.Task<List<UserAuditLogDto>> GetAuditLogsAsync(int? userId = null, DateTime? fromDate = null, DateTime? toDate = null)
        {
            var query = _context.Set<UserAuditLog>().AsQueryable();

            if (userId.HasValue)
            {
                query = query.Where(log => log.TargetUserId == userId.Value || log.PerformedByUserId == userId.Value);
            }

            if (fromDate.HasValue)
            {
                query = query.Where(log => log.CreatedAt >= fromDate.Value);
            }

            if (toDate.HasValue)
            {
                query = query.Where(log => log.CreatedAt <= toDate.Value);
            }

            var logs = await query
                .OrderByDescending(log => log.CreatedAt)
                .Take(1000) // Limit to last 1000 records
                .ToListAsync();

            return logs.Select(log => new UserAuditLogDto
            {
                AuditId = log.AuditId,
                ActionType = log.ActionType,
                TargetUserId = log.TargetUserId,
                TargetUsername = log.TargetUsername,
                TargetUserRole = log.TargetUserRole,
                PerformedByUserId = log.PerformedByUserId,
                PerformedByUsername = log.PerformedByUsername,
                PerformedByRole = log.PerformedByRole,
                ChangesMade = log.ChangesMade,
                Reason = log.Reason,
                IpAddress = log.IpAddress,
                CreatedAt = log.CreatedAt
            }).ToList();
        }

        public async System.Threading.Tasks.Task<List<UserAuditLogDto>> GetUserAuditLogsAsync(int userId, int page = 1, int pageSize = 50)
        {
            var query = _context.Set<UserAuditLog>()
                .Where(log => log.TargetUserId == userId);

            var logs = await query
                .OrderByDescending(log => log.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return logs.Select(log => new UserAuditLogDto
            {
                AuditId = log.AuditId,
                ActionType = log.ActionType,
                TargetUserId = log.TargetUserId,
                TargetUsername = log.TargetUsername,
                TargetUserRole = log.TargetUserRole,
                PerformedByUserId = log.PerformedByUserId,
                PerformedByUsername = log.PerformedByUsername,
                PerformedByRole = log.PerformedByRole,
                ChangesMade = log.ChangesMade,
                Reason = log.Reason,
                IpAddress = log.IpAddress,
                CreatedAt = log.CreatedAt
            }).ToList();
        }

        private string ConvertUserRoleToString(UserRole role)
        {
            return role switch
            {
                UserRole.TeamLeader => "team_leader",
                UserRole.Director => "director",
                UserRole.Engineer => "engineer",
                UserRole.CustomerPersonnel => "customer_personnel",
                UserRole.Customer => "customer",
                UserRole.ShopTL => "shop_tl",
                _ => "unknown"
            };
        }
    }
}