using UserRole = CMT.Application.DTOs.UserRole;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    /// <summary>
    /// Controller for managing role-based permissions.
    /// Replaces the previous localStorage-only approach so that permissions
    /// assigned on one PC/browser are visible on all PCs/browsers.
    /// </summary>
    [ApiController]
    [Route("api/role-permissions")]
    [Authorize]
    public class RolePermissionController : ControllerBase
    {
        private readonly IRolePermissionService _rolePermissionService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly ILogger<RolePermissionController> _logger;

        public RolePermissionController(
            IRolePermissionService rolePermissionService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            ILogger<RolePermissionController> logger)
        {
            _rolePermissionService = rolePermissionService;
            _authorizationService = authorizationService;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/role-permissions
        /// Returns the current role permission matrix.
        /// Any authenticated user can read the matrix (they need it to check their own permissions).
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<RolePermissionMatrixDto>> GetRolePermissionMatrix()
        {
            try
            {
                var matrix = await _rolePermissionService.GetRolePermissionMatrixAsync();
                return Ok(matrix);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving role permission matrix");
                return StatusCode(500, new { message = "Error retrieving role permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/role-permissions
        /// Updates the entire role permission matrix. Admin or TeamLeader only.
        /// </summary>
        [HttpPut]
        public async Task<ActionResult<RolePermissionMatrixDto>> UpdateRolePermissionMatrix(
            [FromBody] UpdateRolePermissionMatrixDto matrixDto)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, UserRole.Admin);
                var isTeamLeader = await _authorizationService.HasRoleAsync(currentUserId, UserRole.TeamLeader);

                if (!isAdmin && !isTeamLeader)
                {
                    return Forbid();
                }

                var updatedMatrix = await _rolePermissionService.SetRolePermissionMatrixAsync(
                    matrixDto,
                    currentUserId);

                _logger.LogInformation(
                    "User {UserId} updated the role permission matrix", currentUserId);

                return Ok(updatedMatrix);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating role permission matrix");
                return StatusCode(500, new { message = "Error updating role permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/role-permissions/reset
        /// Resets the role permission matrix to default values. Admin only.
        /// </summary>
        [HttpPost("reset")]
        public async Task<ActionResult<RolePermissionMatrixDto>> ResetRolePermissionMatrix()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var isAdmin = await _authorizationService.HasRoleAsync(currentUserId, UserRole.Admin);

                if (!isAdmin)
                {
                    return Forbid();
                }

                var resetMatrix = await _rolePermissionService.ResetToDefaultAsync(currentUserId);

                _logger.LogInformation(
                    "Admin {UserId} reset the role permission matrix to defaults", currentUserId);

                return Ok(resetMatrix);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting role permission matrix");
                return StatusCode(500, new { message = "Error resetting role permissions", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/role-permissions/check?role=engineer&permission=delete_task
        /// Check if a specific role has a specific permission.
        /// </summary>
        [HttpGet("check")]
        public async Task<ActionResult> CheckPermission(
            [FromQuery] string role,
            [FromQuery] string permission)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(role) || string.IsNullOrWhiteSpace(permission))
                {
                    return BadRequest(new { message = "Both 'role' and 'permission' query parameters are required" });
                }

                var hasPermission = await _rolePermissionService.HasPermissionAsync(role, permission);
                return Ok(new { role, permission, hasPermission });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking role permission {Role}/{Permission}", role, permission);
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