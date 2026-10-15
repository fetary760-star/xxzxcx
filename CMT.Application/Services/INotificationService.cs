using Microsoft.EntityFrameworkCore;
using CMT.Application.DTOs;
using CMT.Domain.Data;
using System.Text.Json;

namespace CMT.Application.Services;

public interface INotificationService
{
    System.Threading.Tasks.Task NotifyAssignedEngineersAsync(int taskId, IEnumerable<string> engineerNames, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task NotifyTaskStatusChangeAsync(int taskId, string newStatus, string changedBy, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task NotifyAmendmentRequestAsync(int taskId, string requesterName, string reason, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<NotificationListDto> GetNotificationsAsync(int userId, bool unreadOnly = false, int pageNumber = 1, int pageSize = 50, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<List<NotificationDto>> GetUnreadNotificationsAsync(int userId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task MarkNotificationAsReadAsync(int notificationId, int userId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task MarkNotificationAsReadAsync(int notificationId, int userId, bool isPrivileged, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task MarkAllNotificationsAsReadAsync(int userId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> BulkNotificationActionAsync(int userId, BulkNotificationActionDto bulkAction, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> BulkNotificationActionAsync(int userId, BulkNotificationActionDto bulkAction, bool isPrivileged, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<NotificationSettingsDto> GetNotificationSettingsAsync(int userId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> UpdateNotificationSettingsAsync(int userId, NotificationSettingsDto settings, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> DeleteNotificationAsync(int notificationId, int userId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> DeleteNotificationAsync(int notificationId, int userId, bool isPrivileged, CancellationToken cancellationToken = default);
    
    // Intervention notification methods
    System.Threading.Tasks.Task NotifyDirectorsAsync(int taskId, object interventionRequest, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task NotifyTeamLeadsAsync(int taskId, object interventionRequest, CancellationToken cancellationToken = default);
    
    // Role-based notification methods
    System.Threading.Tasks.Task NotifyByRoleAsync(CMT.Domain.Models.UserRole role, string message, string notificationType = "General", string priority = "Medium", int? taskId = null, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> CanUserAccessNotificationAsync(int userId, int notificationId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task<bool> CanUserAccessNotificationAsync(int userId, int notificationId, bool isPrivileged, CancellationToken cancellationToken = default);
    
    // Enhanced methods for role-based access
    System.Threading.Tasks.Task<NotificationListDto> GetNotificationsByRoleAsync(int userId, CMT.Domain.Models.UserRole role, bool unreadOnly = false, int pageNumber = 1, int pageSize = 50, CancellationToken cancellationToken = default);
    
    // NEW: Enhanced notification methods for realistic role-based communication
    System.Threading.Tasks.Task NotifyTaskCreationAsync(int taskId, int creatorId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task NotifyTaskCompletionAsync(int taskId, int completedByUserId, CancellationToken cancellationToken = default);
    System.Threading.Tasks.Task NotifyTaskCommentAsync(int taskId, int commentAuthorId, string commentText, CancellationToken cancellationToken = default);
}

public class NotificationService : INotificationService
{
    private readonly ApplicationDbContext _context;
    private readonly INotificationHubService _hubService;

    public NotificationService(ApplicationDbContext context, INotificationHubService hubService)
    {
        _context = context;
        _hubService = hubService;
    }

    /// <summary>
    /// Notify when a new task is created - implements realistic role-based notification logic
    /// </summary>
    public async System.Threading.Tasks.Task NotifyTaskCreationAsync(int taskId, int creatorId, CancellationToken cancellationToken = default)
    {
        var task = await _context.Tasks
            .Include(t => t.Creator)
            .Include(t => t.Shop)
            .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

        if (task == null) return;

        var creator = await _context.Users.FindAsync(creatorId);
        if (creator == null) return;

        var message = $"New task TC-{taskId} created by {creator.FullName}: {task.Description.Substring(0, Math.Min(100, task.Description.Length))}...";
        var metadata = JsonSerializer.Serialize(new { taskId, creatorId, creatorName = creator.FullName, timestamp = DateTime.UtcNow });

        // Team Leaders receive notifications for ALL task creations (except their own)
        if (creator.Role != CMT.Domain.Models.UserRole.TeamLeader)
        {
            var teamLeaders = await _context.Users
                .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var teamLeader in teamLeaders)
            {
                await CreateNotificationAsync(teamLeader.UserId, message, "TaskCreation", "Medium", taskId, metadata, cancellationToken);
            }
        }

        // Shop Team Leaders receive notifications for tasks created by users they supervise
        if (task.ShopId.HasValue)
        {
            var shopTeamLeaders = await _context.Users
                .Where(u => u.Role == CMT.Domain.Models.UserRole.ShopTL && 
                           u.ShopId == task.ShopId.Value && 
                           u.Status == CMT.Domain.Models.UserStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var shopTL in shopTeamLeaders)
            {
                // Check if this shop_tl supervises the creator
                var isSupervised = await _context.Users
                    .AnyAsync(u => u.UserId == creatorId && u.CreatedByUserId == shopTL.UserId, cancellationToken);

                if (isSupervised || creatorId == shopTL.UserId)
                {
                    await CreateNotificationAsync(shopTL.UserId, message, "TaskCreation", "Medium", taskId, metadata, cancellationToken);
                }
            }
        }

        // Managers receive notifications for tasks created by users they manage
        if (creator.ManagerId.HasValue)
        {
            var manager = await _context.Users.FindAsync(creator.ManagerId.Value);
            if (manager != null && manager.Status == CMT.Domain.Models.UserStatus.Active)
            {
                await CreateNotificationAsync(manager.UserId, message, "TaskCreation", "Medium", taskId, metadata, cancellationToken);
            }
        }
    }

    /// <summary>
    /// Notify assigned engineers - only engineers receive assignment notifications
    /// </summary>
    public async System.Threading.Tasks.Task NotifyAssignedEngineersAsync(int taskId, IEnumerable<string> engineerNames, CancellationToken cancellationToken = default)
    {
        foreach (var engineerName in engineerNames.Where(name => !string.IsNullOrEmpty(name) && name != "Unassigned"))
        {
            var engineer = await _context.Users
                .FirstOrDefaultAsync(u => u.FullName == engineerName.Trim(), cancellationToken);

            if (engineer != null)
            {
                var message = $"New task assigned to you: Task TC-{taskId}";
                var metadata = JsonSerializer.Serialize(new { taskId, engineerName, timestamp = DateTime.UtcNow });

                await CreateNotificationAsync(engineer.UserId, message, "TaskAssignment", "High", taskId, metadata, cancellationToken);
            }
        }

        // Team Leaders also receive task assignment notifications
        var teamLeaders = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        var assignmentMessage = $"Task TC-{taskId} assigned to: {string.Join(", ", engineerNames)}";
        var assignmentMetadata = JsonSerializer.Serialize(new { taskId, engineers = engineerNames, timestamp = DateTime.UtcNow });

        foreach (var teamLeader in teamLeaders)
        {
            await CreateNotificationAsync(teamLeader.UserId, assignmentMessage, "TaskAssignment", "Medium", taskId, assignmentMetadata, cancellationToken);
        }
    }

    /// <summary>
    /// Notify task status change - implements role-based notification logic
    /// </summary>
    public async System.Threading.Tasks.Task NotifyTaskStatusChangeAsync(int taskId, string newStatus, string changedBy, CancellationToken cancellationToken = default)
    {
        var task = await _context.Tasks
            .Include(t => t.Creator)
            .Include(t => t.Shop)
            .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

        if (task == null) return;

        var message = $"Task TC-{taskId} status changed to {newStatus} by {changedBy}";
        var metadata = JsonSerializer.Serialize(new { taskId, newStatus, changedBy, timestamp = DateTime.UtcNow });

        // Notify task creator (if not the one making the change)
        if (task.Creator != null && task.Creator.FullName != changedBy)
        {
            await CreateNotificationAsync(task.Creator.UserId, message, "TaskStatusChange", "Medium", taskId, metadata, cancellationToken);
        }

        // Notify assigned engineers
        if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
        {
            var assignedEngineers = task.AssignedEngineer.Split(',').Select(e => e.Trim());
            foreach (var engineerName in assignedEngineers)
            {
                var engineer = await _context.Users
                    .FirstOrDefaultAsync(u => u.FullName == engineerName, cancellationToken);

                if (engineer != null && engineer.FullName != changedBy)
                {
                    await CreateNotificationAsync(engineer.UserId, message, "TaskStatusChange", "Medium", taskId, metadata, cancellationToken);
                }
            }
        }

        // Team Leaders receive status change notifications
        var teamLeaders = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var teamLeader in teamLeaders)
        {
            if (teamLeader.FullName != changedBy)
            {
                await CreateNotificationAsync(teamLeader.UserId, message, "TaskStatusChange", "Medium", taskId, metadata, cancellationToken);
            }
        }
    }

    /// <summary>
    /// Notify task completion - implements realistic role-based notification logic
    /// </summary>
    public async System.Threading.Tasks.Task NotifyTaskCompletionAsync(int taskId, int completedByUserId, CancellationToken cancellationToken = default)
    {
        var task = await _context.Tasks
            .Include(t => t.Creator)
            .Include(t => t.Shop)
            .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

        if (task == null) return;

        var completedBy = await _context.Users.FindAsync(completedByUserId);
        if (completedBy == null) return;

        var message = $"Task TC-{taskId} completed by {completedBy.FullName}";
        var metadata = JsonSerializer.Serialize(new { taskId, completedByUserId, completedByName = completedBy.FullName, timestamp = DateTime.UtcNow });

        // Notify task creator (always, even if they completed it themselves)
        if (task.Creator != null)
        {
            await CreateNotificationAsync(task.Creator.UserId, message, "TaskCompletion", "High", taskId, metadata, cancellationToken);
        }

        // Team Leaders receive completion notifications
        var teamLeaders = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var teamLeader in teamLeaders)
        {
            await CreateNotificationAsync(teamLeader.UserId, message, "TaskCompletion", "Medium", taskId, metadata, cancellationToken);
        }

        // Shop Team Leaders receive completion notifications for tasks in their scope
        if (task.ShopId.HasValue)
        {
            var shopTeamLeaders = await _context.Users
                .Where(u => u.Role == CMT.Domain.Models.UserRole.ShopTL && 
                           u.ShopId == task.ShopId.Value && 
                           u.Status == CMT.Domain.Models.UserStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var shopTL in shopTeamLeaders)
            {
                // Check if this task is in their supervision scope
                var isInScope = await _context.Users
                    .AnyAsync(u => u.UserId == task.CreatedBy && u.CreatedByUserId == shopTL.UserId, cancellationToken);

                if (isInScope || task.CreatedBy == shopTL.UserId)
                {
                    await CreateNotificationAsync(shopTL.UserId, message, "TaskCompletion", "Medium", taskId, metadata, cancellationToken);
                }
            }
        }

        // Managers receive completion notifications for tasks involving their managed users
        if (task.Creator?.ManagerId.HasValue == true)
        {
            var manager = await _context.Users.FindAsync(task.Creator.ManagerId.Value);
            if (manager != null && manager.Status == CMT.Domain.Models.UserStatus.Active)
            {
                await CreateNotificationAsync(manager.UserId, message, "TaskCompletion", "Medium", taskId, metadata, cancellationToken);
            }
        }

        // Customer Personnel receive completion notifications for tasks they created
        if (task.Creator?.Role == CMT.Domain.Models.UserRole.CustomerPersonnel)
        {
            await CreateNotificationAsync(task.Creator.UserId, message, "TaskCompletion", "High", taskId, metadata, cancellationToken);
        }
    }

    /// <summary>
    /// Notify task comment - implements realistic role-based notification logic
    /// </summary>
    public async System.Threading.Tasks.Task NotifyTaskCommentAsync(int taskId, int commentAuthorId, string commentText, CancellationToken cancellationToken = default)
    {
        var task = await _context.Tasks
            .Include(t => t.Creator)
            .Include(t => t.Shop)
            .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

        if (task == null) return;

        var author = await _context.Users.FindAsync(commentAuthorId);
        if (author == null) return;

        var message = $"New comment on Task TC-{taskId} by {author.FullName}: {commentText.Substring(0, Math.Min(100, commentText.Length))}...";
        var metadata = JsonSerializer.Serialize(new { taskId, commentAuthorId, authorName = author.FullName, timestamp = DateTime.UtcNow });

        // Notify task creator (if not the comment author)
        if (task.Creator != null && task.Creator.UserId != commentAuthorId)
        {
            await CreateNotificationAsync(task.Creator.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
        }

        // Notify assigned engineers (if not the comment author)
        if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
        {
            var assignedEngineers = task.AssignedEngineer.Split(',').Select(e => e.Trim());
            foreach (var engineerName in assignedEngineers)
            {
                var engineer = await _context.Users
                    .FirstOrDefaultAsync(u => u.FullName == engineerName, cancellationToken);

                if (engineer != null && engineer.UserId != commentAuthorId)
                {
                    await CreateNotificationAsync(engineer.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
                }
            }
        }

        // Team Leaders receive comment notifications (except their own comments)
        if (author.Role != CMT.Domain.Models.UserRole.TeamLeader)
        {
            var teamLeaders = await _context.Users
                .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var teamLeader in teamLeaders)
            {
                await CreateNotificationAsync(teamLeader.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
            }
        }

        // Shop Team Leaders receive comment notifications for tasks in their scope
        if (task.ShopId.HasValue)
        {
            var shopTeamLeaders = await _context.Users
                .Where(u => u.Role == CMT.Domain.Models.UserRole.ShopTL && 
                           u.ShopId == task.ShopId.Value && 
                           u.Status == CMT.Domain.Models.UserStatus.Active)
                .ToListAsync(cancellationToken);

            foreach (var shopTL in shopTeamLeaders)
            {
                if (shopTL.UserId != commentAuthorId)
                {
                    // Check if this task is in their supervision scope
                    var isInScope = await _context.Users
                        .AnyAsync(u => u.UserId == task.CreatedBy && u.CreatedByUserId == shopTL.UserId, cancellationToken);

                    if (isInScope || task.CreatedBy == shopTL.UserId)
                    {
                        await CreateNotificationAsync(shopTL.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
                    }
                }
            }
        }

        // Managers receive comment notifications for tasks involving their managed users
        if (task.Creator?.ManagerId.HasValue == true)
        {
            var manager = await _context.Users.FindAsync(task.Creator.ManagerId.Value);
            if (manager != null && manager.Status == CMT.Domain.Models.UserStatus.Active && manager.UserId != commentAuthorId)
            {
                await CreateNotificationAsync(manager.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
            }
        }

        // Customer Personnel receive comment notifications for tasks they created
        if (task.Creator?.Role == CMT.Domain.Models.UserRole.CustomerPersonnel && task.Creator.UserId != commentAuthorId)
        {
            await CreateNotificationAsync(task.Creator.UserId, message, "TaskComment", "Medium", taskId, metadata, cancellationToken);
        }
    }

    /// <summary>
    /// CRITICAL FIX: Notify amendment request - handles both active and completed tasks
    /// Sets TaskId to NULL if task doesn't exist in tasks table to prevent FK constraint violation
    /// </summary>
    public async System.Threading.Tasks.Task NotifyAmendmentRequestAsync(int taskId, string requesterName, string reason, CancellationToken cancellationToken = default)
    {
        // CRITICAL FIX: Check if task exists in tasks table
        var taskExists = await _context.Tasks.AnyAsync(t => t.TaskId == taskId, cancellationToken);
        
        // If task doesn't exist in tasks table, set taskId to null to avoid FK constraint violation
        int? notificationTaskId = taskExists ? taskId : null;

        // Get all team leaders for notification
        var teamLeaders = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        var message = $"Amendment request for Task TC-{taskId} by {requesterName}. Reason: {reason.Substring(0, Math.Min(100, reason.Length))}...";
        var metadata = JsonSerializer.Serialize(new { taskId, requesterName, reason, taskInCompletedTable = !taskExists, timestamp = DateTime.UtcNow });

        foreach (var teamLeader in teamLeaders)
        {
            // Use notificationTaskId (which may be null) instead of taskId to prevent FK violation
            await CreateNotificationAsync(teamLeader.UserId, message, "AmendmentRequest", "High", notificationTaskId, metadata, cancellationToken);
        }
    }

    /// <summary>
    /// Notify Directors - ONLY for escalated intervention requests (after 24 hours)
    /// </summary>
    public async System.Threading.Tasks.Task NotifyDirectorsAsync(int taskId, object interventionRequest, CancellationToken cancellationToken = default)
    {
        // CRITICAL FIX: Check if task exists in tasks table
        var taskExists = await _context.Tasks.AnyAsync(t => t.TaskId == taskId, cancellationToken);
        int? notificationTaskId = taskExists ? taskId : null;

        // Get all directors for notification
        var directors = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.Director && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        var message = $"Intervention request ESCALATED to Director for Task TC-{taskId} (No Team Leader response after 24 hours)";
        var metadata = JsonSerializer.Serialize(new { taskId, interventionRequest, escalated = true, taskInCompletedTable = !taskExists, timestamp = DateTime.UtcNow });

        foreach (var director in directors)
        {
            await CreateNotificationAsync(director.UserId, message, "InterventionRequest", "Urgent", notificationTaskId, metadata, cancellationToken);
        }
    }

    /// <summary>
    /// Notify Team Leaders - for initial intervention requests
    /// </summary>
    public async System.Threading.Tasks.Task NotifyTeamLeadsAsync(int taskId, object interventionRequest, CancellationToken cancellationToken = default)
    {
        // CRITICAL FIX: Check if task exists in tasks table
        var taskExists = await _context.Tasks.AnyAsync(t => t.TaskId == taskId, cancellationToken);
        int? notificationTaskId = taskExists ? taskId : null;

        // Get all team leaders for notification
        var teamLeaders = await _context.Users
            .Where(u => u.Role == CMT.Domain.Models.UserRole.TeamLeader && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        var message = $"Intervention requested for Task TC-{taskId}";
        var metadata = JsonSerializer.Serialize(new { taskId, interventionRequest, taskInCompletedTable = !taskExists, timestamp = DateTime.UtcNow });

        foreach (var teamLeader in teamLeaders)
        {
            await CreateNotificationAsync(teamLeader.UserId, message, "InterventionRequest", "High", notificationTaskId, metadata, cancellationToken);
        }
    }

    public async System.Threading.Tasks.Task NotifyByRoleAsync(CMT.Domain.Models.UserRole role, string message, string notificationType = "General", string priority = "Medium", int? taskId = null, CancellationToken cancellationToken = default)
    {
        // CRITICAL FIX: Check if task exists in tasks table when taskId is provided
        int? notificationTaskId = null;
        if (taskId.HasValue)
        {
            var taskExists = await _context.Tasks.AnyAsync(t => t.TaskId == taskId.Value, cancellationToken);
            notificationTaskId = taskExists ? taskId : null;
        }

        var users = await _context.Users
            .Where(u => u.Role == role && u.Status == CMT.Domain.Models.UserStatus.Active)
            .ToListAsync(cancellationToken);

        foreach (var user in users)
        {
            var metadata = JsonSerializer.Serialize(new { role = role.ToString(), taskId, taskInCompletedTable = taskId.HasValue && !notificationTaskId.HasValue, timestamp = DateTime.UtcNow });
            await CreateNotificationAsync(user.UserId, message, notificationType, priority, notificationTaskId, metadata, cancellationToken);
        }
    }

    private async System.Threading.Tasks.Task CreateNotificationAsync(int userId, string message, string notificationType, string priority, int? taskId, string metadata, CancellationToken cancellationToken)
    {
        var notification = new CMT.Domain.Models.Notification
        {
            UserId = userId,
            Message = message,
            NotificationType = notificationType,
            Priority = priority,
            TaskId = taskId, // This can now be NULL if task is in completed_tasks
            ActionUrl = taskId.HasValue ? $"/tasks/{taskId}" : null,
            Metadata = metadata,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync(cancellationToken);

        // Send real-time notification with full metadata so desktop notifications
        // display the correct title, priority, and action link
        await _hubService.SendNotificationToUserAsync(
            userId.ToString(),
            message,
            notificationType,
            priority,
            taskId?.ToString(),
            taskId.HasValue ? $"/tasks/{taskId}" : null);
    }

    public async System.Threading.Tasks.Task<NotificationListDto> GetNotificationsAsync(int userId, bool unreadOnly = false, int pageNumber = 1, int pageSize = 50, CancellationToken cancellationToken = default)
    {
        var query = _context.Notifications
            .Where(n => n.UserId == userId);

        if (unreadOnly)
        {
            query = query.Where(n => !n.IsRead);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var unreadCount = await _context.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .CountAsync(cancellationToken);

        var rawNotifications = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new
            {
                n.NotificationId,
                n.Message,
                n.CreatedAt,
                n.IsRead,
                n.UserId,
                n.NotificationType,
                n.Priority,
                n.TaskId,
                n.RelatedEntity,
                n.ActionUrl,
                n.Metadata
            })
            .ToListAsync(cancellationToken);

        var notifications = rawNotifications.Select(n => new NotificationDto
            {
                NotificationId = n.NotificationId,
                Message = n.Message,
                CreatedAt = n.CreatedAt,
                IsRead = n.IsRead,
                RecipientId = n.UserId,
                NotificationType = n.NotificationType,
                Priority = n.Priority,
                TaskId = n.TaskId.HasValue ? n.TaskId.Value.ToString() : null,
                RelatedEntity = n.RelatedEntity,
                ActionUrl = n.ActionUrl,
                Metadata = string.IsNullOrEmpty(n.Metadata) ? null : JsonSerializer.Deserialize<Dictionary<string, object>>(n.Metadata)
            })
            .ToList();

        var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

        return new NotificationListDto
        {
            Notifications = notifications,
            TotalCount = totalCount,
            UnreadCount = unreadCount,
            Pagination = new PaginationDto
            {
                Page = pageNumber,
                Limit = pageSize,
                Total = totalCount,
                TotalPages = totalPages,
                HasNext = pageNumber < totalPages,
                HasPrevious = pageNumber > 1
            }
        };
    }

    public async System.Threading.Tasks.Task<NotificationListDto> GetNotificationsByRoleAsync(int userId, CMT.Domain.Models.UserRole role, bool unreadOnly = false, int pageNumber = 1, int pageSize = 50, CancellationToken cancellationToken = default)
    {
        // Get user to verify role
        var user = await _context.Users.FindAsync(userId);
        if (user == null || user.Role != role)
        {
            return new NotificationListDto
            {
                Notifications = new List<NotificationDto>(),
                TotalCount = 0,
                UnreadCount = 0,
                Pagination = new PaginationDto()
            };
        }

        // Return notifications specific to this user based on their role
        return await GetNotificationsAsync(userId, unreadOnly, pageNumber, pageSize, cancellationToken);
    }

    public async System.Threading.Tasks.Task<List<NotificationDto>> GetUnreadNotificationsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var rawNotifications = await _context.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new
            {
                n.NotificationId,
                n.Message,
                n.CreatedAt,
                n.IsRead,
                n.UserId,
                n.NotificationType,
                n.Priority,
                n.TaskId,
                n.RelatedEntity,
                n.ActionUrl,
                n.Metadata
            })
            .ToListAsync(cancellationToken);

        var notifications = rawNotifications.Select(n => new NotificationDto
            {
                NotificationId = n.NotificationId,
                Message = n.Message,
                CreatedAt = n.CreatedAt,
                IsRead = n.IsRead,
                RecipientId = n.UserId,
                NotificationType = n.NotificationType,
                Priority = n.Priority,
                TaskId = n.TaskId.HasValue ? n.TaskId.Value.ToString() : null,
                RelatedEntity = n.RelatedEntity,
                ActionUrl = n.ActionUrl,
                Metadata = string.IsNullOrEmpty(n.Metadata) ? null : JsonSerializer.Deserialize<Dictionary<string, object>>(n.Metadata)
            })
            .ToList();

        return notifications ?? new List<NotificationDto>();
    }

    public async System.Threading.Tasks.Task MarkNotificationAsReadAsync(int notificationId, int userId, CancellationToken cancellationToken = default)
    {
        await MarkNotificationAsReadAsync(notificationId, userId, false, cancellationToken);
    }

    public async System.Threading.Tasks.Task MarkNotificationAsReadAsync(int notificationId, int userId, bool isPrivileged, CancellationToken cancellationToken = default)
    {
        // Privileged roles (TeamLeader/Director/Admin) can mark any notification read.
        // Non-privileged users can only mark their own notifications read.
        var notification = isPrivileged
            ? await _context.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId, cancellationToken)
            : await _context.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId && n.UserId == userId, cancellationToken);

        if (notification != null && !notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async System.Threading.Tasks.Task MarkAllNotificationsAsReadAsync(int userId, CancellationToken cancellationToken = default)
    {
        var notifications = await _context.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ToListAsync(cancellationToken);

        var readAt = DateTime.UtcNow;
        foreach (var notification in notifications)
        {
            notification.IsRead = true;
            notification.ReadAt = readAt;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async System.Threading.Tasks.Task<bool> BulkNotificationActionAsync(int userId, BulkNotificationActionDto bulkAction, CancellationToken cancellationToken = default)
    {
        return await BulkNotificationActionAsync(userId, bulkAction, false, cancellationToken);
    }

    public async System.Threading.Tasks.Task<bool> BulkNotificationActionAsync(int userId, BulkNotificationActionDto bulkAction, bool isPrivileged, CancellationToken cancellationToken = default)
    {
        // Privileged roles can operate on any listed notification; regular users are scoped to their own.
        var notifications = isPrivileged
            ? await _context.Notifications
                .Where(n => bulkAction.NotificationIds.Contains(n.NotificationId))
                .ToListAsync(cancellationToken)
            : await _context.Notifications
                .Where(n => n.UserId == userId && bulkAction.NotificationIds.Contains(n.NotificationId))
                .ToListAsync(cancellationToken);

        if (!notifications.Any()) return false;

        var timestamp = DateTime.UtcNow;

        switch (bulkAction.Action.ToLower())
        {
            case "mark_read":
                foreach (var notification in notifications.Where(n => !n.IsRead))
                {
                    notification.IsRead = true;
                    notification.ReadAt = timestamp;
                }
                break;

            case "mark_unread":
                foreach (var notification in notifications.Where(n => n.IsRead))
                {
                    notification.IsRead = false;
                    notification.ReadAt = null;
                }
                break;

            case "delete":
                _context.Notifications.RemoveRange(notifications);
                break;

            default:
                return false;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async System.Threading.Tasks.Task<bool> DeleteNotificationAsync(int notificationId, int userId, CancellationToken cancellationToken = default)
    {
        return await DeleteNotificationAsync(notificationId, userId, false, cancellationToken);
    }

    public async System.Threading.Tasks.Task<bool> DeleteNotificationAsync(int notificationId, int userId, bool isPrivileged, CancellationToken cancellationToken = default)
    {
        var notification = isPrivileged
            ? await _context.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId, cancellationToken)
            : await _context.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId && n.UserId == userId, cancellationToken);

        if (notification != null)
        {
            _context.Notifications.Remove(notification);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        return false;
    }

    public async System.Threading.Tasks.Task<bool> CanUserAccessNotificationAsync(int userId, int notificationId, CancellationToken cancellationToken = default)
    {
        return await CanUserAccessNotificationAsync(userId, notificationId, false, cancellationToken);
    }

    public async System.Threading.Tasks.Task<bool> CanUserAccessNotificationAsync(int userId, int notificationId, bool isPrivileged, CancellationToken cancellationToken = default)
    {
        if (isPrivileged)
        {
            return await _context.Notifications.AnyAsync(n => n.NotificationId == notificationId, cancellationToken);
        }

        return await _context.Notifications
            .AnyAsync(n => n.NotificationId == notificationId && n.UserId == userId, cancellationToken);
    }

    public async System.Threading.Tasks.Task<NotificationSettingsDto> GetNotificationSettingsAsync(int userId, CancellationToken cancellationToken = default)
    {
        // Return default settings - implement actual settings storage as needed
        return new NotificationSettingsDto
        {
            UserId = userId,
            EmailNotifications = true,
            PushNotifications = true,
            TaskAssignments = true,
            DeadlineWarnings = true,
            TaskCompletions = false,
            SystemUpdates = true,
            AmendmentRequests = true,
            InterventionRequests = true,
            UpdatedAt = DateTime.UtcNow
        };
    }

    public async System.Threading.Tasks.Task<bool> UpdateNotificationSettingsAsync(int userId, NotificationSettingsDto settings, CancellationToken cancellationToken = default)
    {
        // Implement settings update logic here
        await System.Threading.Tasks.Task.Delay(1, cancellationToken);
        return true;
    }
}