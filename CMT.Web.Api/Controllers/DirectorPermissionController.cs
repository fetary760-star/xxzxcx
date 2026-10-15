using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    /// <summary>
    /// Controller for managing Director permissions (Admin only)
    /// </summary>
    [ApiController]
    [Route("api/director-permissions")]
    [Authorize]
    public class DirectorPermissionController : ControllerBase
    {
        private readonly IDirectorPermissionService _directorPermissionService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly ILogger<DirectorPermissionController> _logger;

        public DirectorPermissionController(
            IDirectorPermissionService directorPermissionService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            ILogger<DirectorPermissionController> logger)
        {
            _directorPermissionService = directorPermissionService;
            _authorizationService = authorizationService;
            _logger = logger;
        }

        /// <summary>
        /// Get permissions for a specific director
        /// Admin can view any director's permissions
        /// Directors can view their own permissions
        /// </summary>
        [HttpGet("{directorUserId}")]
        public async Task<ActionResult<DirectorPermissionDto>> GetDirectorPermissions(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                
                // Only admin or the director themselves can view permissions
                if (!isAdmin && currentUserId != directorUserId)
                {
                    return Forbid();
                }

                var permissions = await _directorPermissionService.GetDirectorPermissionsAsync(directorUserId);
                
                if (permissions == null)
                {
                    return NotFound(new { message = "Director permissions not found" });
                }

                return Ok(permissions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving director permissions for user {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "Error retrieving permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Update permissions for a director (Admin only)
        /// </summary>
        [HttpPut("{directorUserId}")]
        public async Task<ActionResult<DirectorPermissionDto>> UpdateDirectorPermissions(
            int directorUserId,
            [FromBody] UpdateDirectorPermissionDto permissionDto)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                
                if (!isAdmin)
                {
                    return Forbid();
                }

                // Ensure the userId in the DTO matches the route parameter
                permissionDto.UserId = directorUserId;

                var updatedPermissions = await _directorPermissionService.SetDirectorPermissionsAsync(
                    permissionDto, 
                    currentUserId);

                _logger.LogInformation("Admin {AdminId} updated permissions for Director {DirectorId}", 
                    currentUserId, directorUserId);

                return Ok(updatedPermissions);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while updating director permissions");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating director permissions for user {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "Error updating permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all directors with their permission details (Admin only)
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<List<DirectorWithPermissionsDto>>> GetAllDirectorsWithPermissions()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                
                if (!isAdmin)
                {
                    return Forbid();
                }

                var directors = await _directorPermissionService.GetAllDirectorsWithPermissionsAsync();
                return Ok(directors);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all directors with permissions");
                return StatusCode(500, new { message = "Error retrieving directors", error = ex.Message });
            }
        }

        /// <summary>
        /// Reset director permissions to default values (Admin only)
        /// </summary>
        [HttpPost("{directorUserId}/reset")]
        public async Task<ActionResult<DirectorPermissionDto>> ResetDirectorPermissions(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                
                if (!isAdmin)
                {
                    return Forbid();
                }

                var resetPermissions = await _directorPermissionService.ResetToDefaultPermissionsAsync(
                    directorUserId, 
                    currentUserId);

                _logger.LogInformation("Admin {AdminId} reset permissions for Director {DirectorId} to defaults", 
                    currentUserId, directorUserId);

                return Ok(resetPermissions);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while resetting director permissions");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting director permissions for user {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "Error resetting permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Check if a director has a specific permission
        /// </summary>
        [HttpGet("{directorUserId}/check/{permissionName}")]
        public async Task<ActionResult<bool>> CheckDirectorPermission(int directorUserId, string permissionName)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                
                // Only admin or the director themselves can check permissions
                if (!isAdmin && currentUserId != directorUserId)
                {
                    return Forbid();
                }

                var hasPermission = await _directorPermissionService.HasPermissionAsync(
                    directorUserId, 
                    permissionName);

                return Ok(new { hasPermission });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking director permission {Permission} for user {DirectorUserId}", 
                    permissionName, directorUserId);
                return StatusCode(500, new { message = "Error checking permission", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }
}