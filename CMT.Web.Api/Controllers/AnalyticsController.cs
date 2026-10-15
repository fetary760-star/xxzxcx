using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Services;
using CMT.Application.Interfaces;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/analytics")]
    [Authorize]
    public class AnalyticsController : ControllerBase
    {
        private readonly IAnalyticsService _analyticsService;
        private readonly IUserService _userService;
        private readonly ILogger<AnalyticsController> _logger;

        public AnalyticsController(
            IAnalyticsService analyticsService,
            IUserService userService,
            ILogger<AnalyticsController> logger)
        {
            _analyticsService = analyticsService;
            _userService = userService;
            _logger = logger;
        }

        /// <summary>
        /// Get completion rate analytics with real data from database.
        /// Returns total tasks across all statuses, completed count, and per-status breakdown.
        /// CompletionRate = (CompletedTasks / TotalTasks) * 100
        /// </summary>
        [HttpGet("completion-rate")]
        public async Task<ActionResult<CompletionRateAnalyticsDto>> GetCompletionRateAnalytics()
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

                _logger.LogInformation("Getting completion rate analytics for user {UserId} with role {Role}",
                    currentUserId, currentUser.Role);

                var analytics = await _analyticsService.GetCompletionRateAnalyticsAsync(
                    currentUserId,
                    currentUser.Role,
                    currentUser.ShopId);

                return Ok(analytics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving completion rate analytics");
                return StatusCode(500, new { message = "An error occurred while retrieving completion rate analytics", error = ex.Message });
            }
        }

        /// <summary>
        /// Get average delay analytics with real data from database.
        /// Analyzes all completed tasks (from completed_tasks table and active table)
        /// to compute average delay, on-time/early/late counts, and per-task breakdown.
        /// Prefers EngineerCompletedAt over ActualCompletionDate for accuracy.
        /// </summary>
        [HttpGet("avg-delay")]
        public async Task<ActionResult<AvgDelayAnalyticsDto>> GetAvgDelayAnalytics()
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

                _logger.LogInformation("Getting average delay analytics for user {UserId} with role {Role}",
                    currentUserId, currentUser.Role);

                var analytics = await _analyticsService.GetAvgDelayAnalyticsAsync(
                    currentUserId,
                    currentUser.Role,
                    currentUser.ShopId);

                return Ok(analytics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving average delay analytics");
                return StatusCode(500, new { message = "An error occurred while retrieving average delay analytics", error = ex.Message });
            }
        }

        /// <summary>
        /// Get tasks completed analytics with real data from database.
        /// Combines completed tasks from both completed_tasks table and active table.
        /// Priority stats show completion rate per priority level against total tasks.
        /// </summary>
        [HttpGet("tasks-completed")]
        public async Task<ActionResult<TasksCompletedAnalyticsDto>> GetTasksCompletedAnalytics()
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

                _logger.LogInformation("Getting tasks completed analytics for user {UserId} with role {Role}",
                    currentUserId, currentUser.Role);

                var analytics = await _analyticsService.GetTasksCompletedAnalyticsAsync(
                    currentUserId,
                    currentUser.Role,
                    currentUser.ShopId);

                return Ok(analytics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving tasks completed analytics");
                return StatusCode(500, new { message = "An error occurred while retrieving tasks completed analytics", error = ex.Message });
            }
        }

        /// <summary>
        /// Get pending tasks analytics with real data from database.
        /// Includes tasks with status: Pending, InProgress, Blocked, OnHold, Paused, PendingTLApproval.
        /// </summary>
        [HttpGet("pending-tasks")]
        public async Task<ActionResult<PendingTasksAnalyticsDto>> GetPendingTasksAnalytics()
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

                _logger.LogInformation("Getting pending tasks analytics for user {UserId} with role {Role}",
                    currentUserId, currentUser.Role);

                var analytics = await _analyticsService.GetPendingTasksAnalyticsAsync(
                    currentUserId,
                    currentUser.Role,
                    currentUser.ShopId);

                return Ok(analytics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving pending tasks analytics");
                return StatusCode(500, new { message = "An error occurred while retrieving pending tasks analytics", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }
}