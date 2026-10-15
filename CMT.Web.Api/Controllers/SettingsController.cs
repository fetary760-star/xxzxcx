using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SettingsController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly IUserAuditService _auditService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;

        public SettingsController(
            IUserService userService, 
            IUserAuditService auditService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService)
        {
            _userService = userService;
            _auditService = auditService;
            _authorizationService = authorizationService;
        }

        /// <summary>
        /// Get current user's settings - accessible by any authenticated user
        /// </summary>
        [HttpGet("me")]
        public async Task<ActionResult<UserSettingsDto>> GetMySettings()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                if (currentUserId == 0)
                    return Unauthorized(new { message = "User ID not found in token" });

                var user = await _userService.GetUserByIdAsync(currentUserId);
                if (user == null)
                    return NotFound(new { message = "User not found" });

                var settings = new UserSettingsDto
                {
                    UserId = user.UserId,
                    Username = user.Username,
                    Email = user.Email,
                    PhoneNumber = user.PhoneNumber,
                    FullName = user.FullName,
                    Role = user.Role,
                    Status = user.Status,
                    ShopId = user.ShopId,
                    ShopName = user.ShopName,
                    SupervisorId = user.SupervisorId,
                    SupervisorName = user.SupervisorName,
                    // Settings-specific fields
                    EmailNotifications = true, // Default value, can be stored in user preferences
                    TaskReminders = true,
                    WeeklyReports = user.Role != "customer_personnel", // Only for internal users
                    InAppToastNotifications = true, // Default value - toast popups enabled by default
                    DarkMode = false, // Default value
                    Language = "en-US", // Default value
                    TimeZone = "UTC", // Default value
                    CanChangeRole = CanUserChangeRole(user.Role),
                    CanChangeShop = CanUserChangeShop(user.Role),
                    CanChangeSupervisor = CanUserChangeSupervisor(user.Role)
                };

                return Ok(settings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving settings", error = ex.Message });
            }
        }

        /// <summary>
        /// Update current user's settings - accessible by any authenticated user
        /// </summary>
        [HttpPut("me")]
        public async Task<ActionResult<UserSettingsDto>> UpdateMySettings([FromBody] UpdateSettingsDto updateSettingsDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var currentUserId = GetCurrentUserId();
                if (currentUserId == 0)
                    return Unauthorized(new { message = "User ID not found in token" });

                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                if (currentUser == null)
                    return NotFound(new { message = "User not found" });

                // Track changes for audit logging
                var changesList = new List<string>();
                
                // Basic profile updates that users can make
                var updateUserDto = new UpdateUserDto();
                bool hasUserChanges = false;

                if (!string.IsNullOrEmpty(updateSettingsDto.FullName) && updateSettingsDto.FullName != currentUser.FullName)
                {
                    updateUserDto.FullName = updateSettingsDto.FullName;
                    changesList.Add($"Full Name: '{currentUser.FullName}' → '{updateSettingsDto.FullName}'");
                    hasUserChanges = true;
                }

                if (!string.IsNullOrEmpty(updateSettingsDto.Username) && updateSettingsDto.Username != currentUser.Username)
                {
                    updateUserDto.Username = updateSettingsDto.Username;
                    changesList.Add($"Username: '{currentUser.Username}' → '{updateSettingsDto.Username}'");
                    hasUserChanges = true;
                }
                
                if (!string.IsNullOrEmpty(updateSettingsDto.Email) && updateSettingsDto.Email != currentUser.Email)
                {
                    updateUserDto.Email = updateSettingsDto.Email;
                    changesList.Add($"Email: '{currentUser.Email}' → '{updateSettingsDto.Email}'");
                    hasUserChanges = true;
                }

                // Handle phone number updates - any authenticated user can update their own phone number
                if (updateSettingsDto.PhoneNumber != null && updateSettingsDto.PhoneNumber != currentUser.PhoneNumber)
                {
                    updateUserDto.PhoneNumber = updateSettingsDto.PhoneNumber;
                    changesList.Add($"PhoneNumber: '{currentUser.PhoneNumber ?? "N/A"}' → '{updateSettingsDto.PhoneNumber}'");
                    hasUserChanges = true;
                }

                // Role-based restrictions for sensitive settings
                if (updateSettingsDto.Role != null && updateSettingsDto.Role != currentUser.Role)
                {
                    if (!CanUserChangeRole(currentUser.Role))
                    {
                        return Forbid("You do not have permission to change your role");
                    }
                    updateUserDto.Role = updateSettingsDto.Role;
                    changesList.Add($"Role: '{currentUser.Role}' → '{updateSettingsDto.Role}'");
                    hasUserChanges = true;
                }

                if (updateSettingsDto.ShopId.HasValue && updateSettingsDto.ShopId != currentUser.ShopId)
                {
                    if (!CanUserChangeShop(currentUser.Role))
                    {
                        return Forbid("You do not have permission to change your shop assignment");
                    }
                    updateUserDto.ShopId = updateSettingsDto.ShopId;
                    changesList.Add($"Shop ID: '{currentUser.ShopId}' → '{updateSettingsDto.ShopId}'");
                    hasUserChanges = true;
                }

                if (updateSettingsDto.SupervisorId.HasValue && updateSettingsDto.SupervisorId != currentUser.SupervisorId)
                {
                    if (!CanUserChangeSupervisor(currentUser.Role))
                    {
                        return Forbid("You do not have permission to change your supervisor");
                    }
                    updateUserDto.SupervisorId = updateSettingsDto.SupervisorId;
                    changesList.Add($"Supervisor ID: '{currentUser.SupervisorId}' → '{updateSettingsDto.SupervisorId}'");
                    hasUserChanges = true;
                }

                // Update user if there are changes
                UserDto updatedUser = currentUser;
                if (hasUserChanges)
                {
                    var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                    updatedUser = await _userService.UpdateUserAsync(currentUserId, updateUserDto, currentUserId, ipAddress);
                }

                // Log preference changes (these would typically be stored in a separate UserPreferences table)
                var preferenceChanges = new List<string>();
                
                if (updateSettingsDto.EmailNotifications.HasValue)
                    preferenceChanges.Add($"Email Notifications: {updateSettingsDto.EmailNotifications.Value}");
                
                if (updateSettingsDto.TaskReminders.HasValue)
                    preferenceChanges.Add($"Task Reminders: {updateSettingsDto.TaskReminders.Value}");
                
                if (updateSettingsDto.WeeklyReports.HasValue)
                    preferenceChanges.Add($"Weekly Reports: {updateSettingsDto.WeeklyReports.Value}");

                if (updateSettingsDto.InAppToastNotifications.HasValue)
                    preferenceChanges.Add($"In-App Toast Notifications: {updateSettingsDto.InAppToastNotifications.Value}");
                
                if (updateSettingsDto.DarkMode.HasValue)
                    preferenceChanges.Add($"Dark Mode: {updateSettingsDto.DarkMode.Value}");
                
                if (!string.IsNullOrEmpty(updateSettingsDto.Language))
                    preferenceChanges.Add($"Language: {updateSettingsDto.Language}");
                
                if (!string.IsNullOrEmpty(updateSettingsDto.TimeZone))
                    preferenceChanges.Add($"Time Zone: {updateSettingsDto.TimeZone}");

                // Log the settings update action
                if (changesList.Any() || preferenceChanges.Any())
                {
                    var allChanges = changesList.Concat(preferenceChanges);
                    var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                    await _auditService.LogUserActionAsync(
                        "SETTINGS_UPDATE",
                        currentUserId,
                        currentUserId,
                        string.Join("; ", allChanges),
                        "User updated their settings",
                        ipAddress
                    );
                }

                var settings = new UserSettingsDto
                {
                    UserId = updatedUser.UserId,
                    Username = updatedUser.Username,
                    Email = updatedUser.Email,
                    PhoneNumber = updatedUser.PhoneNumber,
                    FullName = updatedUser.FullName,
                    Role = updatedUser.Role,
                    Status = updatedUser.Status,
                    ShopId = updatedUser.ShopId,
                    ShopName = updatedUser.ShopName,
                    SupervisorId = updatedUser.SupervisorId,
                    SupervisorName = updatedUser.SupervisorName,
                    // Return updated preferences (in real implementation, these would come from UserPreferences table)
                    EmailNotifications = updateSettingsDto.EmailNotifications ?? true,
                    TaskReminders = updateSettingsDto.TaskReminders ?? true,
                    WeeklyReports = updateSettingsDto.WeeklyReports ?? (updatedUser.Role != "customer_personnel"),
                    InAppToastNotifications = updateSettingsDto.InAppToastNotifications ?? true,
                    DarkMode = updateSettingsDto.DarkMode ?? false,
                    Language = updateSettingsDto.Language ?? "en-US",
                    TimeZone = updateSettingsDto.TimeZone ?? "UTC",
                    CanChangeRole = CanUserChangeRole(updatedUser.Role),
                    CanChangeShop = CanUserChangeShop(updatedUser.Role),
                    CanChangeSupervisor = CanUserChangeSupervisor(updatedUser.Role)
                };

                return Ok(settings);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while updating settings", error = ex.Message });
            }
        }

        /// <summary>
        /// Get user settings by ID - only accessible by team leaders and directors
        /// </summary>
        [HttpGet("{userId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<UserSettingsDto>> GetUserSettings(int userId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var targetUser = await _userService.GetUserByIdAsync(userId);

                if (targetUser == null)
                    return NotFound(new { message = "User not found" });

                // Shop TL can only view settings of users they created
                if (currentUser?.Role == "shop_tl")
                {
                    if (targetUser.CreatedByUserId != currentUserId)
                    {
                        return Forbid("You can only view settings of users you created");
                    }
                    
                    if (targetUser.Role != "customer_personnel")
                    {
                        return Forbid("You can only view customer personnel settings");
                    }
                }

                var settings = new UserSettingsDto
                {
                    UserId = targetUser.UserId,
                    Username = targetUser.Username,
                    Email = targetUser.Email,
                    PhoneNumber = targetUser.PhoneNumber,
                    FullName = targetUser.FullName,
                    Role = targetUser.Role,
                    Status = targetUser.Status,
                    ShopId = targetUser.ShopId,
                    ShopName = targetUser.ShopName,
                    SupervisorId = targetUser.SupervisorId,
                    SupervisorName = targetUser.SupervisorName,
                    // Default settings values (would come from UserPreferences table in real implementation)
                    EmailNotifications = true,
                    TaskReminders = true,
                    WeeklyReports = targetUser.Role != "customer_personnel",
                    InAppToastNotifications = true,
                    DarkMode = false,
                    Language = "en-US",
                    TimeZone = "UTC",
                    CanChangeRole = false, // Other users cannot change settings for this user
                    CanChangeShop = false,
                    CanChangeSupervisor = false
                };

                // Log settings view action
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                await _auditService.LogUserActionAsync(
                    "SETTINGS_VIEW",
                    userId,
                    currentUserId,
                    null,
                    $"User settings viewed by {currentUser?.Role}",
                    ipAddress
                );

                return Ok(settings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving user settings", error = ex.Message });
            }
        }

        /// <summary>
        /// Change password - accessible by any authenticated user
        /// </summary>
      [HttpPost("me/change-password")]
public async Task<ActionResult> ChangePassword([FromBody] ChangePasswordDto changePasswordDto)
{
    try
    {
        if (!ModelState.IsValid)
        {
            // ModelState 
            return Ok(new { success = false, message = "Invalid data provided", errors = ModelState });
        }

        var currentUserId = GetCurrentUserId();
        if (currentUserId == 0)
        {
            return Ok(new { success = false, message = "User ID not found in token" });
        }

        var result = await _userService.ChangePasswordAsync(currentUserId, changePasswordDto);
        
     
        if (!result)
        {
            // BadRequest 
            return Ok(new { success = false, message = "Current password is incorrect" });
        }

        // Log password change
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        await _auditService.LogUserActionAsync(
            "PASSWORD_CHANGE",
            currentUserId,
            currentUserId,
            null,
            "User changed their password",
            ipAddress
        );

       
        return Ok(new { success = true, message = "Password changed successfully" });
    }
    catch (Exception ex)
    {
        return Ok(new { success = false, message = "An error occurred while changing the password", error = ex.Message });
    }
}

        /// <summary>
        /// Get audit log for current user - accessible by any authenticated user
        /// </summary>
        [HttpGet("me/audit-log")]
        public async Task<ActionResult<List<UserAuditLogDto>>> GetMyAuditLog([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                if (currentUserId == 0)
                    return Unauthorized(new { message = "User ID not found in token" });

                var auditLogs = await _auditService.GetUserAuditLogsAsync(currentUserId, page, pageSize);
                return Ok(auditLogs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving audit log", error = ex.Message });
            }
        }

        /// <summary>
        /// Get audit log for specific user - only accessible by team leaders and directors
        /// </summary>
        [HttpGet("{userId}/audit-log")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserAuditLogDto>>> GetUserAuditLog(int userId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var targetUser = await _userService.GetUserByIdAsync(userId);

                if (targetUser == null)
                    return NotFound(new { message = "User not found" });

                // Shop TL can only view audit logs of users they created
                if (currentUser?.Role == "shop_tl")
                {
                    if (targetUser.CreatedByUserId != currentUserId)
                    {
                        return Forbid("You can only view audit logs of users you created");
                    }
                }

                var auditLogs = await _auditService.GetUserAuditLogsAsync(userId, page, pageSize);

                // Log audit log access
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                await _auditService.LogUserActionAsync(
                    "AUDIT_LOG_VIEW",
                    userId,
                    currentUserId,
                    $"Page: {page}, PageSize: {pageSize}",
                    $"User audit log viewed by {currentUser?.Role}",
                    ipAddress
                );

                return Ok(auditLogs);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving audit log", error = ex.Message });
            }
        }

        private bool CanUserChangeRole(string userRole)
        {
            // Only directors can change roles
            return userRole == "director";
        }

        private bool CanUserChangeShop(string userRole)
        {
            // Only team leaders and directors can change shop assignments
            return userRole == "team_leader" || userRole == "director";
        }

        private bool CanUserChangeSupervisor(string userRole)
        {
            // Only team leaders and directors can change supervisor assignments
            return userRole == "team_leader" || userRole == "director";
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }

    public class UpdateSettingsDto
    {
        [StringLength(100)]
        public string? FullName { get; set; }

        [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters")]
        [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Username can only contain letters, numbers, and underscores")]
        public string? Username { get; set; }

        [EmailAddress]
        [StringLength(100)]
        public string? Email { get; set; }

        [Phone(ErrorMessage = "Please enter a valid phone number")]
        [StringLength(20, ErrorMessage = "Phone number cannot exceed 20 characters")]
        public string? PhoneNumber { get; set; }

        public string? Role { get; set; }

        public int? ShopId { get; set; }

        public int? SupervisorId { get; set; }

        // User preference settings
        public bool? EmailNotifications { get; set; }

        public bool? TaskReminders { get; set; }

        public bool? WeeklyReports { get; set; }

        public bool? InAppToastNotifications { get; set; }

        public bool? DarkMode { get; set; }

        [StringLength(10)]
        public string? Language { get; set; }

        [StringLength(50)]
        public string? TimeZone { get; set; }
    }

    public class UserSettingsDto
    {
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public int? SupervisorId { get; set; }
        public string? SupervisorName { get; set; }

        // User preference settings
        public bool EmailNotifications { get; set; }
        public bool TaskReminders { get; set; }
        public bool WeeklyReports { get; set; }
        public bool InAppToastNotifications { get; set; }
        public bool DarkMode { get; set; }
        public string Language { get; set; } = "en-US";
        public string TimeZone { get; set; } = "UTC";

        // Permission flags
        public bool CanChangeRole { get; set; }
        public bool CanChangeShop { get; set; }
        public bool CanChangeSupervisor { get; set; }
    }

    public class UserAuditLogDto
    {
        public int AuditId { get; set; }
        public string Action { get; set; } = string.Empty;
        public int TargetUserId { get; set; }
        public string TargetUserName { get; set; } = string.Empty;
        public int PerformedByUserId { get; set; }
        public string PerformedByUserName { get; set; } = string.Empty;
        public string? Details { get; set; }
        public string? Notes { get; set; }
        public string? IpAddress { get; set; }
        public DateTime Timestamp { get; set; }
    }
}