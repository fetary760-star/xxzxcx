using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]s")]
    [Authorize]
    public class DirectorController : ControllerBase
    {
        private readonly IDirectorService _directorService;
        private readonly IUserService _userService;
        private readonly ILogger<DirectorController> _logger;

        public DirectorController(
            IDirectorService directorService,
            IUserService userService,
            ILogger<DirectorController> logger)
        {
            _directorService = directorService;
            _userService = userService;
            _logger = logger;
        }

        /// <summary>
        /// Get director's dashboard with department summaries
        /// UPDATED: Now includes Team Leaders created by Director and their tasks
        /// </summary>
        [HttpGet("{directorUserId}/dashboard")]
        public async Task<ActionResult<DirectorDashboardDto>> GetDirectorDashboard(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view this dashboard" });
                }

                var dashboard = await _directorService.GetDirectorDashboardAsync(directorUserId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving director dashboard for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving director dashboard", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all departments managed by a director
        /// </summary>
        [HttpGet("{directorUserId}/departments")]
        public async Task<ActionResult<List<DepartmentDto>>> GetDirectorDepartments(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view these departments" });
                }

                var departments = await _directorService.GetDirectorDepartmentsAsync(directorUserId);
                return Ok(departments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving departments for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving departments", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all managers in director's departments
        /// </summary>
        [HttpGet("{directorUserId}/managers")]
        public async Task<ActionResult<List<UserDto>>> GetDepartmentManagers(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view these managers" });
                }

                var managers = await _directorService.GetDepartmentManagersAsync(directorUserId);
                return Ok(managers);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving managers for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving managers", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all users in director's departments
        /// UPDATED: Now includes Team Leaders created by Director (even without DepartmentId)
        /// </summary>
        [HttpGet("{directorUserId}/users")]
        public async Task<ActionResult<List<UserDto>>> GetDepartmentUsers(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view these users" });
                }

                var users = await _directorService.GetDepartmentUsersAsync(directorUserId);
                return Ok(users);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving users for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving users", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all user IDs within director's assigned departments for task filtering
        /// This endpoint is used by the frontend to filter tasks by department scope
        /// UPDATED: Now includes all users created by Director (Team Leaders, etc.) regardless of DepartmentId
        /// </summary>
        [HttpGet("{directorUserId}/department-users")]
        public async Task<ActionResult<List<int>>> GetDepartmentUserIds(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view this data" });
                }

                _logger.LogInformation("Getting department user IDs for Director {DirectorUserId}", directorUserId);

                var userIds = await _directorService.GetDepartmentUserIdsAsync(directorUserId);
                
                _logger.LogInformation("Director {DirectorUserId} has access to {Count} users", directorUserId, userIds.Count);

                return Ok(userIds);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving department user IDs for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving department users", error = ex.Message });
            }
        }

        /// <summary>
        /// NEW: Get Team Leaders created by this Director with their task metrics
        /// This provides a focused view of Team Leaders and their Engineers for the Director's board
        /// </summary>
        [HttpGet("{directorUserId}/team-leaders")]
        public async Task<ActionResult<List<TeamLeaderDetailDto>>> GetDirectorTeamLeaders(int directorUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only the director themselves or team leaders can access this
                if (currentUserId != directorUserId && currentUser?.Role != "team_leader")
                {
                    return StatusCode(403, new { error = "You don't have permission to view this data" });
                }

                _logger.LogInformation("Getting Team Leaders created by Director {DirectorUserId}", directorUserId);

                var teamLeaders = await _directorService.GetDirectorTeamLeadersAsync(directorUserId);
                
                _logger.LogInformation("Director {DirectorUserId} has created {Count} Team Leaders", directorUserId, teamLeaders.Count);

                return Ok(teamLeaders);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving Team Leaders for director {DirectorUserId}", directorUserId);
                return StatusCode(500, new { message = "An error occurred while retrieving Team Leaders", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }
}