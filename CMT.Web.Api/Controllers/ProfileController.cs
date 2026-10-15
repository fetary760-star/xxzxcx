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
    public class ProfileController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly IUserAuditService _auditService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;

        public ProfileController(
            IUserService userService, 
            IUserAuditService auditService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService)
        {
            _userService = userService;
            _auditService = auditService;
            _authorizationService = authorizationService;
        }

        /// <summary>
        /// Get current user's profile - accessible by any authenticated user
        /// </summary>
        [HttpGet("me")]
        public async Task<ActionResult<UserProfileDto>> GetMyProfile()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                if (currentUserId == 0)
                    return Unauthorized(new { message = "User ID not found in token" });

                var user = await _userService.GetUserByIdAsync(currentUserId);
                if (user == null)
                    return NotFound(new { message = "User not found" });

                var profile = new UserProfileDto
                {
                    UserId = user.UserId,
                    Username = user.Username,
                    Email = user.Email,
                    PhoneNumber = user.PhoneNumber,
                    FullName = user.FullName,
                    Role = user.Role,
                    Status = user.Status,
                    ProfilePicturePath = user.ProfilePicturePath,
                    ShopId = user.ShopId,
                    ShopName = user.ShopName,
                    SupervisorId = user.SupervisorId,
                    SupervisorName = user.SupervisorName,
                    PersonnelType = user.PersonnelType,
                    CreatedAt = user.CreatedAt,
                    UpdatedAt = user.UpdatedAt ?? user.CreatedAt // FIXED: Handle nullable UpdatedAt
                };

                return Ok(profile);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving profile", error = ex.Message });
            }
        }

        /// <summary>
        /// Update current user's profile - accessible by any authenticated user
        /// </summary>
        [HttpPut("me")]
        public async Task<ActionResult<UserProfileDto>> UpdateMyProfile([FromBody] UpdateProfileDto updateProfileDto)
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
                
                if (!string.IsNullOrEmpty(updateProfileDto.FullName) && updateProfileDto.FullName != currentUser.FullName)
                    changesList.Add($"Full Name: '{currentUser.FullName}' → '{updateProfileDto.FullName}'");
                
                if (!string.IsNullOrEmpty(updateProfileDto.Email) && updateProfileDto.Email != currentUser.Email)
                    changesList.Add($"Email: '{currentUser.Email}' → '{updateProfileDto.Email}'");

                if (!string.IsNullOrEmpty(updateProfileDto.ProfilePicturePath) && updateProfileDto.ProfilePicturePath != currentUser.ProfilePicturePath)
                    changesList.Add($"Profile Picture: '{currentUser.ProfilePicturePath}' → '{updateProfileDto.ProfilePicturePath}'");

                if (updateProfileDto.PhoneNumber != null && updateProfileDto.PhoneNumber != currentUser.PhoneNumber)
                    changesList.Add($"Phone Number: '{currentUser.PhoneNumber ?? "N/A"}' → '{updateProfileDto.PhoneNumber}'");

                // Create update DTO for user service
                var updateUserDto = new UpdateUserDto
                {
                    FullName = updateProfileDto.FullName,
                    Email = updateProfileDto.Email,
                    PhoneNumber = updateProfileDto.PhoneNumber,
                    ProfilePicturePath = updateProfileDto.ProfilePicturePath
                    // Note: Users cannot change their own role, shop, supervisor, etc. through profile
                };

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var updatedUser = await _userService.UpdateUserAsync(currentUserId, updateUserDto, currentUserId, ipAddress);

                // Log the profile update action
                if (changesList.Any())
                {
                    await _auditService.LogUserActionAsync(
                        "PROFILE_UPDATE",
                        currentUserId,
                        currentUserId,
                        string.Join("; ", changesList),
                        "User updated their own profile",
                        ipAddress
                    );
                }

                var profile = new UserProfileDto
                {
                    UserId = updatedUser.UserId,
                    Username = updatedUser.Username,
                    Email = updatedUser.Email,
                    PhoneNumber = updatedUser.PhoneNumber,
                    FullName = updatedUser.FullName,
                    Role = updatedUser.Role,
                    Status = updatedUser.Status,
                    ProfilePicturePath = updatedUser.ProfilePicturePath,
                    ShopId = updatedUser.ShopId,
                    ShopName = updatedUser.ShopName,
                    SupervisorId = updatedUser.SupervisorId,
                    SupervisorName = updatedUser.SupervisorName,
                    PersonnelType = updatedUser.PersonnelType,
                    CreatedAt = updatedUser.CreatedAt,
                    UpdatedAt = updatedUser.UpdatedAt ?? updatedUser.CreatedAt // FIXED: Handle nullable UpdatedAt
                };

                return Ok(profile);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while updating profile", error = ex.Message });
            }
        }

        /// <summary>
        /// Get user profile by ID - only accessible by team leaders and directors
        /// </summary>
        [HttpGet("{userId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<UserProfileDto>> GetUserProfile(int userId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var targetUser = await _userService.GetUserByIdAsync(userId);

                if (targetUser == null)
                    return NotFound(new { message = "User not found" });

                // Shop TL can only view profiles of users they created
                if (currentUser?.Role == "shop_tl")
                {
                    if (targetUser.CreatedByUserId != currentUserId)
                    {
                        return Forbid("You can only view profiles of users you created");
                    }
                    
                    if (targetUser.Role != "customer_personnel")
                    {
                        return Forbid("You can only view customer personnel profiles");
                    }
                }

                var profile = new UserProfileDto
                {
                    UserId = targetUser.UserId,
                    Username = targetUser.Username,
                    Email = targetUser.Email,
                    PhoneNumber = targetUser.PhoneNumber,
                    FullName = targetUser.FullName,
                    Role = targetUser.Role,
                    Status = targetUser.Status,
                    ProfilePicturePath = targetUser.ProfilePicturePath,
                    ShopId = targetUser.ShopId,
                    ShopName = targetUser.ShopName,
                    SupervisorId = targetUser.SupervisorId,
                    SupervisorName = targetUser.SupervisorName,
                    PersonnelType = targetUser.PersonnelType,
                    CreatedAt = targetUser.CreatedAt,
                    UpdatedAt = targetUser.UpdatedAt ?? targetUser.CreatedAt // FIXED: Handle nullable UpdatedAt
                };

                // Log profile view action
                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                await _auditService.LogUserActionAsync(
                    "PROFILE_VIEW",
                    userId,
                    currentUserId,
                    null,
                    $"User profile viewed by {currentUser?.Role}",
                    ipAddress
                );

                return Ok(profile);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving user profile", error = ex.Message });
            }
        }

        /// <summary>
        /// Upload profile picture - accessible by any authenticated user
        /// </summary>
        [HttpPost("me/profile-picture")]
        public async Task<ActionResult<string>> UploadProfilePicture(IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest(new { message = "No file uploaded" });

                // Validate file type
                var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif" };
                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!allowedExtensions.Contains(extension))
                    return BadRequest(new { message = "Invalid file type. Only JPG, PNG, and GIF files are allowed." });

                // Validate file size (max 5MB)
                if (file.Length > 5 * 1024 * 1024)
                    return BadRequest(new { message = "File size cannot exceed 5MB" });

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                if (currentUser == null)
                    return NotFound(new { message = "User not found" });

                // Generate unique filename
                var fileName = $"profile_{currentUserId}_{DateTime.UtcNow:yyyyMMddHHmmss}{extension}";
                var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "profiles");
                
                // Create directory if it doesn't exist
                if (!Directory.Exists(uploadsPath))
                    Directory.CreateDirectory(uploadsPath);

                var filePath = Path.Combine(uploadsPath, fileName);
                
                // Save the file
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                // Update user's profile picture path
                var relativePath = $"/uploads/profiles/{fileName}";
                var updateDto = new UpdateUserDto
                {
                    ProfilePicturePath = relativePath
                };

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                await _userService.UpdateUserAsync(currentUserId, updateDto, currentUserId, ipAddress);

                // Log the profile picture update
                await _auditService.LogUserActionAsync(
                    "PROFILE_PICTURE_UPDATE",
                    currentUserId,
                    currentUserId,
                    $"Profile picture updated: {relativePath}",
                    "User uploaded new profile picture",
                    ipAddress
                );

                return Ok(new { profilePicturePath = relativePath });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while uploading profile picture", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }

    public class UpdateProfileDto
    {
        [StringLength(100)]
        public string? FullName { get; set; }

        [EmailAddress]
        [StringLength(100)]
        public string? Email { get; set; }

        [Phone]
        [StringLength(20)]
        public string? PhoneNumber { get; set; }

        [StringLength(255)]
        public string? ProfilePicturePath { get; set; }
    }

    public class UserProfileDto
    {
        public int UserId { get; set; }
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? ProfilePicturePath { get; set; }
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public int? SupervisorId { get; set; }
        public string? SupervisorName { get; set; }
        public string? PersonnelType { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; } // Keep as non-nullable, handle conversion in controller
    }
}