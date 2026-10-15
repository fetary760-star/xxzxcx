using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    /// <summary>
    /// Controller for managing Team Leader permissions (Admin/Director only).
    /// Mirrors DirectorPermissionController but for TeamLeader users.
    /// Routes: api/tl-permissions
    /// </summary>
    [ApiController]
    [Route("api/tl-permissions")]
    [Authorize]
    public class TlPermissionController : ControllerBase
    {
        private readonly ITlPermissionService _tlPermissionService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly ILogger<TlPermissionController> _logger;

        public TlPermissionController(
            ITlPermissionService tlPermissionService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            ILogger<TlPermissionController> logger)
        {
            _tlPermissionService = tlPermissionService;
            _authorizationService = authorizationService;
            _logger = logger;
        }

        /// <summary>
        /// Get permissions for a specific team leader.
        /// Admin/Director can view any TL's permissions.
        /// Team Leaders can view their own permissions.
        /// </summary>
        [HttpGet("{teamLeaderUserId}")]
        public async Task<ActionResult<TlPermissionDto>> GetTlPermissions(int teamLeaderUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                var isDirector = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Director);

                // Only admin, director, or the team leader themselves can view permissions
                if (!isAdmin && !isDirector && currentUserId != teamLeaderUserId)
                {
                    return Forbid();
                }

                var permissions = await _tlPermissionService.GetTlPermissionsAsync(teamLeaderUserId);

                if (permissions == null)
                {
                    return NotFound(new { message = "Team Leader permissions not found" });
                }

                return Ok(permissions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving TL permissions for user {TeamLeaderUserId}", teamLeaderUserId);
                return StatusCode(500, new { message = "Error retrieving permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Update permissions for a team leader (Admin/Director only).
        /// </summary>
        [HttpPut("{teamLeaderUserId}")]
        public async Task<ActionResult<TlPermissionDto>> UpdateTlPermissions(
            int teamLeaderUserId,
            [FromBody] UpdateTlPermissionDto permissionDto)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                var isDirector = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Director);

                if (!isAdmin && !isDirector)
                {
                    return Forbid();
                }

                // Ensure the userId in the DTO matches the route parameter
                permissionDto.UserId = teamLeaderUserId;

                var updatedPermissions = await _tlPermissionService.SetTlPermissionsAsync(
                    permissionDto,
                    currentUserId);

                _logger.LogInformation("User {AdminId} updated permissions for Team Leader {TeamLeaderId}",
                    currentUserId, teamLeaderUserId);

                return Ok(updatedPermissions);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while updating TL permissions");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating TL permissions for user {TeamLeaderUserId}", teamLeaderUserId);
                return StatusCode(500, new { message = "Error updating permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all team leaders with their permission details (Admin/Director only).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<List<TeamLeaderWithPermissionsDto>>> GetAllTeamLeadersWithPermissions()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                var isDirector = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Director);

                if (!isAdmin && !isDirector)
                {
                    return Forbid();
                }

                var teamLeaders = await _tlPermissionService.GetAllTeamLeadersWithPermissionsAsync();
                return Ok(teamLeaders);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all team leaders with permissions");
                return StatusCode(500, new { message = "Error retrieving team leaders", error = ex.Message });
            }
        }

        /// <summary>
        /// Reset team leader permissions to default values (Admin/Director only).
        /// </summary>
        [HttpPost("{teamLeaderUserId}/reset")]
        public async Task<ActionResult<TlPermissionDto>> ResetTlPermissions(int teamLeaderUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                var isDirector = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Director);

                if (!isAdmin && !isDirector)
                {
                    return Forbid();
                }

                var resetPermissions = await _tlPermissionService.ResetToDefaultPermissionsAsync(
                    teamLeaderUserId,
                    currentUserId);

                _logger.LogInformation("User {AdminId} reset permissions for Team Leader {TeamLeaderId} to defaults",
                    currentUserId, teamLeaderUserId);

                return Ok(resetPermissions);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while resetting TL permissions");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting TL permissions for user {TeamLeaderUserId}", teamLeaderUserId);
                return StatusCode(500, new { message = "Error resetting permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// Check if a team leader has a specific permission.
        /// </summary>
        [HttpGet("{teamLeaderUserId}/check/{permissionName}")]
        public async Task<ActionResult<bool>> CheckTlPermission(int teamLeaderUserId, string permissionName)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Admin);
                var isDirector = await _authorizationService.HasRoleAsync(currentUserId, CMT.Application.DTOs.UserRole.Director);

                // Only admin, director, or the team leader themselves can check permissions
                if (!isAdmin && !isDirector && currentUserId != teamLeaderUserId)
                {
                    return Forbid();
                }

                var hasPermission = await _tlPermissionService.HasPermissionAsync(
                    teamLeaderUserId,
                    permissionName);

                return Ok(new { hasPermission });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking TL permission {Permission} for user {TeamLeaderUserId}",
                    permissionName, teamLeaderUserId);
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