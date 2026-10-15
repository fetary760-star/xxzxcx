using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using CMT.Application.Services;
using CMT.Application.DTOs;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/notifications")]
    [AllowAnonymous] // Temporarily allow anonymous access for testing
    public class NotificationController : ControllerBase
    {
        private readonly INotificationService _notificationService;
        private readonly ILogger<NotificationController> _logger;

        public NotificationController(INotificationService notificationService, ILogger<NotificationController> logger)
        {
            _notificationService = notificationService;
            _logger = logger;
        }

        /// <summary>
        /// Extract the raw JWT from Authorization header or known auth cookies.
        /// Returns null if no token can be located.
        /// </summary>
        private string? ExtractJwtFromRequest()
        {
            // 1) Authorization: Bearer <token>
            var authHeader = Request.Headers["Authorization"].ToString();
            if (!string.IsNullOrWhiteSpace(authHeader))
            {
                const string bearerPrefix = "Bearer ";
                if (authHeader.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    var token = authHeader.Substring(bearerPrefix.Length).Trim();
                    if (!string.IsNullOrEmpty(token)) return token;
                }
            }

            // 2) Cookie fallbacks (access_token / auth_token / authToken)
            string[] cookieNames = { "access_token", "auth_token", "authToken" };
            foreach (var name in cookieNames)
            {
                if (Request.Cookies.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value))
                {
                    return value.Trim();
                }
            }

            return null;
        }

        /// <summary>
        /// Attempts to read the user id from the JWT without validating the signature.
        /// This is a defensive fallback for routes marked [AllowAnonymous] where
        /// ASP.NET Core has NOT populated HttpContext.User from the bearer token.
        /// Returns null if no usable id was found.
        /// </summary>
        private int? ReadUserIdFromRawJwt()
        {
            var token = ExtractJwtFromRequest();
            if (string.IsNullOrWhiteSpace(token)) return null;

            try
            {
                var handler = new JwtSecurityTokenHandler();
                if (!handler.CanReadToken(token)) return null;

                var jwt = handler.ReadJwtToken(token);
                // Try the common claim types used across the app
                string[] claimTypes =
                {
                    ClaimTypes.NameIdentifier,
                    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
                    "userId",
                    "sub",
                    "id",
                    "nameid"
                };

                foreach (var ct in claimTypes)
                {
                    var c = jwt.Claims.FirstOrDefault(x => string.Equals(x.Type, ct, StringComparison.OrdinalIgnoreCase));
                    if (c != null && int.TryParse(c.Value, out var uid))
                    {
                        return uid;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse JWT while resolving current user id");
            }

            return null;
        }

        private int GetCurrentUserId()
        {
            // Try to get user ID from various claim types (populated by JwtBearer middleware)
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier) ?? 
                             User.FindFirst("userId") ?? 
                             User.FindFirst("sub") ?? 
                             User.FindFirst("id");
            
            if (userIdClaim != null && int.TryParse(userIdClaim.Value, out int userId))
            {
                return userId;
            }

            // [AllowAnonymous] path: JwtBearer middleware may not populate User.
            // Parse the raw JWT we receive (Authorization header or auth cookies) and use its nameidentifier.
            var fromRawJwt = ReadUserIdFromRawJwt();
            if (fromRawJwt.HasValue)
            {
                return fromRawJwt.Value;
            }
            
            // Absolute last-resort fallback (anonymous, no token at all)
            if (!User.Identity?.IsAuthenticated ?? true)
            {
                _logger.LogWarning("No authenticated user found and no bearer token supplied, using default user ID for testing");
                return 1; // Default test user ID
            }
            
            throw new UnauthorizedAccessException("User ID not found in token");
        }

        private string GetCurrentUserRole()
        {
            var roleClaim = User.FindFirst(ClaimTypes.Role)?.Value ?? 
                            User.FindFirst("role")?.Value ?? 
                            User.FindFirst("user_role")?.Value;

            if (!string.IsNullOrEmpty(roleClaim)) return roleClaim;

            // Fallback: parse raw JWT
            var token = ExtractJwtFromRequest();
            if (!string.IsNullOrWhiteSpace(token))
            {
                try
                {
                    var handler = new JwtSecurityTokenHandler();
                    if (handler.CanReadToken(token))
                    {
                        var jwt = handler.ReadJwtToken(token);
                        string[] roleClaimTypes =
                        {
                            ClaimTypes.Role,
                            "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
                            "Role",
                            "role",
                            "user_role"
                        };
                        foreach (var ct in roleClaimTypes)
                        {
                            var c = jwt.Claims.FirstOrDefault(x => string.Equals(x.Type, ct, StringComparison.OrdinalIgnoreCase));
                            if (c != null && !string.IsNullOrEmpty(c.Value)) return c.Value;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse JWT while resolving current user role");
                }
            }

            return "Engineer"; // Default role for testing
        }

        /// <summary>
        /// Returns true when the current caller has a role that is allowed to
        /// manage notifications that do not belong to them (TeamLeader, Director, Admin).
        /// Role comparison is case-insensitive and tolerant of snake_case variants
        /// (e.g. "team_leader" from the JWT Role claim).
        /// </summary>
        private bool IsCurrentUserPrivileged()
        {
            var role = GetCurrentUserRole() ?? string.Empty;
            var normalized = role.Replace("_", string.Empty).Replace("-", string.Empty).Trim();
            return normalized.Equals("TeamLeader", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("Director", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("Admin", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Get notifications for the current user with pagination and filtering
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<NotificationListDto>> GetNotifications(
            [FromQuery] bool unreadOnly = false,
            [FromQuery] int pageNumber = 1,
            [FromQuery] int pageSize = 50)
        {
            try
            {
                var userId = GetCurrentUserId();
                _logger.LogInformation("Getting notifications for user {UserId}", userId);
                
                var result = await _notificationService.GetNotificationsAsync(userId, unreadOnly, pageNumber, pageSize);
                
                _logger.LogInformation("Retrieved {Count} notifications for user {UserId}", result.Notifications.Count, userId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving notifications");
                return StatusCode(500, new { message = "An error occurred while retrieving notifications", error = ex.Message });
            }
        }

        /// <summary>
        /// Get notifications for a specific user (admin/manager only)
        /// </summary>
        [HttpGet("user/{userId}")]
        public async Task<ActionResult<NotificationListDto>> GetUserNotifications(int userId, 
            [FromQuery] bool unreadOnly = false,
            [FromQuery] int pageNumber = 1,
            [FromQuery] int pageSize = 50)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUserRole = GetCurrentUserRole();

                // Users can only access their own notifications unless they're admin/director/team leader
                if (userId != currentUserId && !new[] { "Admin", "Director", "TeamLeader" }.Contains(currentUserRole))
                {
                    _logger.LogWarning("User {CurrentUserId} with role {Role} attempted to access notifications for user {UserId}", 
                        currentUserId, currentUserRole, userId);
                    return Forbid("You can only access your own notifications");
                }

                var result = await _notificationService.GetNotificationsAsync(userId, unreadOnly, pageNumber, pageSize);
                
                _logger.LogInformation("Retrieved {Count} notifications for user {UserId} by user {CurrentUserId}", 
                    result.Notifications.Count, userId, currentUserId);
                
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving notifications for user {UserId}", userId);
                return StatusCode(500, new { message = "An error occurred while retrieving notifications", error = ex.Message });
            }
        }

        /// <summary>
        /// Mark a specific notification as read
        /// </summary>
        [HttpPost("{notificationId}/read")]
        [HttpPatch("{notificationId}/read")]
        public async Task<ActionResult> MarkAsRead(int notificationId)
        {
            try
            {
                var userId = GetCurrentUserId();
                var isPrivileged = IsCurrentUserPrivileged();

                // Verify user can access this notification (privileged roles can access any)
                var canAccess = await _notificationService.CanUserAccessNotificationAsync(userId, notificationId, isPrivileged);
                if (!canAccess)
                {
                    return Forbid("You cannot access this notification");
                }

                await _notificationService.MarkNotificationAsReadAsync(notificationId, userId, isPrivileged);

                var result = new
                {
                    notificationId = notificationId,
                    isRead = true,
                    updatedAt = DateTime.UtcNow,
                    message = "Notification marked as read successfully"
                };

                _logger.LogInformation("Notification {NotificationId} marked as read by user {UserId}", notificationId, userId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking notification {NotificationId} as read", notificationId);
                return StatusCode(500, new { message = "An error occurred while marking notification as read", error = ex.Message });
            }
        }

        /// <summary>
        /// Mark all notifications as read for the current user
        /// </summary>
        [HttpPost("mark-all-read")]
        [HttpPatch("mark-all-read")]
        public async Task<ActionResult> MarkAllAsRead()
        {
            try
            {
                var userId = GetCurrentUserId();
                await _notificationService.MarkAllNotificationsAsReadAsync(userId);

                var result = new
                {
                    userId = userId,
                    updatedAt = DateTime.UtcNow,
                    message = "All notifications marked as read successfully"
                };

                _logger.LogInformation("All notifications marked as read for user {UserId}", userId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking all notifications as read for user {UserId}", GetCurrentUserId());
                return StatusCode(500, new { message = "An error occurred while marking all notifications as read", error = ex.Message });
            }
        }

        /// <summary>
        /// Bulk actions on notifications (mark read/unread, delete)
        /// </summary>
        [HttpPost("bulk-action")]
        public async Task<ActionResult> BulkAction([FromBody] BulkNotificationActionDto bulkAction)
        {
            try
            {
                var userId = GetCurrentUserId();
                var isPrivileged = IsCurrentUserPrivileged();
                var success = await _notificationService.BulkNotificationActionAsync(userId, bulkAction, isPrivileged);

                if (!success)
                {
                    return BadRequest(new { message = "Bulk action failed or no notifications found" });
                }

                var result = new
                {
                    userId = userId,
                    action = bulkAction.Action,
                    affectedCount = bulkAction.NotificationIds.Count,
                    updatedAt = DateTime.UtcNow,
                    message = $"Bulk action '{bulkAction.Action}' completed successfully"
                };

                _logger.LogInformation("Bulk action '{Action}' performed on {Count} notifications for user {UserId}", 
                    bulkAction.Action, bulkAction.NotificationIds.Count, userId);
                
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error performing bulk action for user {UserId}", GetCurrentUserId());
                return StatusCode(500, new { message = "An error occurred while performing bulk action", error = ex.Message });
            }
        }

        /// <summary>
        /// Delete a specific notification
        /// </summary>
        [HttpDelete("{notificationId}")]
        public async Task<ActionResult> DeleteNotification(int notificationId)
        {
            try
            {
                var userId = GetCurrentUserId();
                var isPrivileged = IsCurrentUserPrivileged();

                // Verify user can access this notification (privileged roles can access any)
                var canAccess = await _notificationService.CanUserAccessNotificationAsync(userId, notificationId, isPrivileged);
                if (!canAccess)
                {
                    return Forbid("You cannot access this notification");
                }

                var success = await _notificationService.DeleteNotificationAsync(notificationId, userId, isPrivileged);
                
                if (!success)
                {
                    return NotFound(new { message = "Notification not found" });
                }

                var result = new
                {
                    notificationId = notificationId,
                    deletedAt = DateTime.UtcNow,
                    message = "Notification deleted successfully"
                };

                _logger.LogInformation("Notification {NotificationId} deleted by user {UserId}", notificationId, userId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting notification {NotificationId}", notificationId);
                return StatusCode(500, new { message = "An error occurred while deleting notification", error = ex.Message });
            }
        }

        /// <summary>
        /// Get notification settings for the current user
        /// </summary>
        [HttpGet("settings")]
        public async Task<ActionResult<NotificationSettingsDto>> GetNotificationSettings()
        {
            try
            {
                var userId = GetCurrentUserId();
                var settings = await _notificationService.GetNotificationSettingsAsync(userId);
                
                _logger.LogInformation("Retrieved notification settings for user {UserId}", userId);
                return Ok(settings);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving notification settings for user {UserId}", GetCurrentUserId());
                return StatusCode(500, new { message = "An error occurred while retrieving notification settings", error = ex.Message });
            }
        }

        /// <summary>
        /// Update notification settings for the current user
        /// </summary>
        [HttpPut("settings")]
        public async Task<ActionResult> UpdateNotificationSettings([FromBody] NotificationSettingsDto settings)
        {
            try
            {
                var userId = GetCurrentUserId();
                settings.UserId = userId; // Ensure user can only update their own settings
                
                var success = await _notificationService.UpdateNotificationSettingsAsync(userId, settings);
                
                if (!success)
                {
                    return BadRequest(new { message = "Failed to update notification settings" });
                }

                var result = new
                {
                    userId = userId,
                    updatedAt = DateTime.UtcNow,
                    message = "Notification settings updated successfully"
                };

                _logger.LogInformation("Notification settings updated for user {UserId}", userId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating notification settings for user {UserId}", GetCurrentUserId());
                return StatusCode(500, new { message = "An error occurred while updating notification settings", error = ex.Message });
            }
        }

        /// <summary>
        /// Get unread notification count for the current user
        /// </summary>
        [HttpGet("unread-count")]
        public async Task<ActionResult> GetUnreadCount()
        {
            try
            {
                var userId = GetCurrentUserId();
                var notifications = await _notificationService.GetUnreadNotificationsAsync(userId);
                
                var result = new
                {
                    userId = userId,
                    unreadCount = notifications.Count,
                    timestamp = DateTime.UtcNow
                };

                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning("Unauthorized access attempt: {Message}", ex.Message);
                return Unauthorized(new { message = "Authentication required", error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving unread count for user {UserId}", GetCurrentUserId());
                return StatusCode(500, new { message = "An error occurred while retrieving unread count", error = ex.Message });
            }
        }

        /// <summary>
        /// Test endpoint to create sample notifications for testing
        /// </summary>
        [HttpPost("test/create-sample")]
        public async Task<ActionResult> CreateSampleNotifications()
        {
            try
            {
                var userId = GetCurrentUserId();
                
                // Create some sample notifications for testing
                await _notificationService.NotifyByRoleAsync(
                    CMT.Domain.Models.UserRole.Engineer, 
                    "Welcome to the improved notification system! This is a test notification.",
                    "System",
                    "Medium"
                );

                await _notificationService.NotifyByRoleAsync(
                    CMT.Domain.Models.UserRole.Engineer, 
                    "High priority task assignment notification for testing.",
                    "TaskAssignment",
                    "High",
                    123
                );

                await _notificationService.NotifyByRoleAsync(
                    CMT.Domain.Models.UserRole.Engineer, 
                    "Low priority system update notification.",
                    "System",
                    "Low"
                );

                return Ok(new { message = "Sample notifications created successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating sample notifications");
                return StatusCode(500, new { message = "An error occurred while creating sample notifications", error = ex.Message });
            }
        }
    }
}