using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DashboardController : ControllerBase
    {
        private readonly IDashboardService _dashboardService;
        private readonly IUserService _userService;
        private readonly IDepartmentService _departmentService;
        private readonly ILogger<DashboardController> _logger;

        public DashboardController(
            IDashboardService dashboardService,
            IUserService userService,
            IDepartmentService departmentService,
            ILogger<DashboardController> logger)
        {
            _dashboardService = dashboardService;
            _userService = userService;
            _departmentService = departmentService;
            _logger = logger;
        }

        [HttpGet("metrics")]
        public async Task<ActionResult<DashboardMetricsDto>> GetDashboardMetrics()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser == null)
                {
                    _logger.LogWarning("Could not find current user {UserId}", currentUserId);
                    return Unauthorized();
                }

                _logger.LogInformation("Getting dashboard metrics for user {UserId} with role {Role}", 
                    currentUserId, currentUser.Role);

                var metrics = await _dashboardService.GetDashboardMetricsAsync(
                    currentUserId, 
                    currentUser.Role, 
                    currentUser.ShopId);

                return Ok(metrics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving dashboard metrics");
                return StatusCode(500, new { message = "An error occurred while retrieving dashboard metrics", error = ex.Message });
            }
        }

        [HttpGet("user/{userId}/performance")]
        public async Task<ActionResult<UserPerformanceMetricsDto>> GetUserPerformance(int userId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                // Check permissions - users can view their own performance, team leaders and directors can view all
                if (currentUserId != userId && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "director")
                {
                    return StatusCode(403, new { error = "You can only view your own performance metrics" });
                }

                // FIXED: Directors can only view performance of users in departments they manage
                if (currentUser?.Role == "director" && currentUserId != userId)
                {
                    var targetUser = await _userService.GetUserByIdAsync(userId);
                    if (targetUser == null)
                    {
                        return NotFound(new { message = "User not found" });
                    }

                    // Get departments managed by this director
                    var directorDepartments = await _departmentService.GetDepartmentsByDirectorAsync(currentUserId);
                    
                    if (!directorDepartments.Any())
                    {
                        return StatusCode(403, new { error = "You must be assigned to manage at least one department" });
                    }

                    // Check if target user belongs to any of the director's departments
                    var departmentIds = directorDepartments.Select(d => d.DepartmentId).ToList();
                    if (!targetUser.DepartmentId.HasValue || !departmentIds.Contains(targetUser.DepartmentId.Value))
                    {
                        return StatusCode(403, new { error = "You can only view performance metrics for users in your departments" });
                    }
                }

                var metrics = await _dashboardService.GetUserPerformanceMetricsAsync(userId);
                return Ok(metrics);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user performance metrics for user {UserId}", userId);
                return StatusCode(500, new { message = "An error occurred while retrieving user performance metrics", error = ex.Message });
            }
        }

        [HttpGet("shop/{shopId}/performance")]
        public async Task<ActionResult<ShopPerformanceMetricsDto>> GetShopPerformance(int shopId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                // Check permissions - shop TL can view their shop, team leaders and directors can view all
                if (currentUser?.Role == "shop_tl" && currentUser?.ShopId != shopId)
                {
                    return StatusCode(403, new { error = "You can only view performance metrics for your assigned shop" });
                }
                else if (currentUser?.Role != "team_leader" && 
                         currentUser?.Role != "director" && 
                         currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { error = "You don't have permission to view shop performance metrics" });
                }

                var metrics = await _dashboardService.GetShopPerformanceMetricsAsync(shopId);
                return Ok(metrics);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving shop performance metrics for shop {ShopId}", shopId);
                return StatusCode(500, new { message = "An error occurred while retrieving shop performance metrics", error = ex.Message });
            }
        }

        [HttpGet("users/performance")]
        public async Task<ActionResult<List<UserPerformanceMetricsDto>>> GetAllUsersPerformance()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                // Only team leaders and directors can view all users performance
                if (currentUser?.Role != "team_leader" && currentUser?.Role != "director")
                {
                    return StatusCode(403, new { error = "You don't have permission to view all users performance metrics" });
                }

                var metrics = await _dashboardService.GetAllUsersPerformanceAsync();

                // FIXED: Filter for directors - only show users in departments they manage
                if (currentUser?.Role == "director")
                {
                    var directorDepartments = await _departmentService.GetDepartmentsByDirectorAsync(currentUserId);
                    var departmentIds = directorDepartments.Select(d => d.DepartmentId).ToHashSet();

                    if (departmentIds.Any())
                    {
                        var allUsers = await _userService.GetAllUsersAsync();
                        var departmentUserIds = allUsers
                            .Where(u => u.DepartmentId.HasValue && departmentIds.Contains(u.DepartmentId.Value))
                            .Select(u => u.UserId)
                            .ToHashSet();

                        metrics = metrics.Where(m => departmentUserIds.Contains(m.UserId)).ToList();
                    }
                    else
                    {
                        // Director has no departments, return empty list
                        metrics = new List<UserPerformanceMetricsDto>();
                    }
                }

                return Ok(metrics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all users performance metrics");
                return StatusCode(500, new { message = "An error occurred while retrieving users performance metrics", error = ex.Message });
            }
        }

        [HttpGet("shops/performance")]
        public async Task<ActionResult<List<ShopPerformanceMetricsDto>>> GetAllShopsPerformance()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                // Only team leaders and directors can view all shops performance
                if (currentUser?.Role != "team_leader" && currentUser?.Role != "director")
                {
                    return StatusCode(403, new { error = "You don't have permission to view all shops performance metrics" });
                }

                var metrics = await _dashboardService.GetAllShopsPerformanceAsync();
                return Ok(metrics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all shops performance metrics");
                return StatusCode(500, new { message = "An error occurred while retrieving shops performance metrics", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }
}