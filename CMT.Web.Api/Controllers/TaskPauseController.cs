using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using System.Security.Claims;
using CMT.Domain.Data;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/tasks")]
    [Authorize]
    public class TaskPauseController : ControllerBase
    {
        private readonly ITaskPauseService _taskPauseService;
        private readonly ILogger<TaskPauseController> _logger;
        private readonly ApplicationDbContext _context;

        public TaskPauseController(
            ITaskPauseService taskPauseService,
            ILogger<TaskPauseController> logger,
            ApplicationDbContext context)
        {
            _taskPauseService = taskPauseService;
            _logger = logger;
            _context = context;
        }

        private async Task<(int UserId, string UserName, string UserRole)> GetCurrentUserAsync()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                return (1, "System", "system");
            }

            if (string.IsNullOrEmpty(userRole))
            {
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    userRole = user.Role.ToString();
                    userName = user.FullName;
                }
                else
                {
                    userRole = "unknown";
                }
            }

            return (userId, userName ?? "Unknown", userRole);
        }

        /// <summary>
        /// Pause a task. Engineers can pause their assigned tasks with a reason.
        /// </summary>
        [HttpPost("{taskId}/pause")]
        public async Task<ActionResult<TaskPauseHistoryDto>> PauseTask(
            int taskId,
            [FromBody] PauseTaskRequestDto request,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                _logger.LogInformation("Pause request for task {TaskId} by user {UserId} ({UserName}, {UserRole})",
                    taskId, userId, userName, userRole);

                if (string.IsNullOrWhiteSpace(request.PauseReason))
                {
                    return BadRequest(new { error = "Pause reason is required" });
                }

                var result = await _taskPauseService.PauseTaskAsync(
                    taskId, userId, request.PauseReason, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to pause task";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    message = "Task paused successfully",
                    pauseHistory = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error pausing task {TaskId}", taskId);
                return StatusCode(500, new { error = "An error occurred while pausing the task", details = ex.Message });
            }
        }

        /// <summary>
        /// Resume a paused task. Returns the task to InProgress status.
        /// </summary>
        [HttpPost("{taskId}/resume")]
        public async Task<ActionResult<TaskPauseHistoryDto>> ResumeTask(
            int taskId,
            [FromBody] ResumeTaskRequestDto request,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                _logger.LogInformation("Resume request for task {TaskId} by user {UserId} ({UserName}, {UserRole})",
                    taskId, userId, userName, userRole);

                var result = await _taskPauseService.ResumeTaskAsync(
                    taskId, userId, request.ResumeComment, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to resume task";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    message = "Task resumed successfully",
                    pauseHistory = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resuming task {TaskId}", taskId);
                return StatusCode(500, new { error = "An error occurred while resuming the task", details = ex.Message });
            }
        }

        /// <summary>
        /// Get pause/resume history for a task.
        /// </summary>
        [HttpGet("{taskId}/pause-history")]
        public async Task<ActionResult<TaskPauseHistoryDto>> GetPauseHistory(
            int taskId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _taskPauseService.GetPauseHistoryAsync(taskId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get pause history";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    pauseHistory = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting pause history for task {TaskId}", taskId);
                return StatusCode(500, new { error = "An error occurred while getting pause history", details = ex.Message });
            }
        }
    }
}