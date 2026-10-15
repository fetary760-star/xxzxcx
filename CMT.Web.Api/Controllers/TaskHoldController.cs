using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using System.Security.Claims;
using CMT.Domain.Data;
using Microsoft.EntityFrameworkCore;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/task-holds")]
    [Authorize]
    public class TaskHoldController : ControllerBase
    {
        private readonly ITaskHoldService _taskHoldService;
        private readonly ILogger<TaskHoldController> _logger;
        private readonly ApplicationDbContext _context;

        public TaskHoldController(
            ITaskHoldService taskHoldService,
            ILogger<TaskHoldController> logger,
            ApplicationDbContext context)
        {
            _taskHoldService = taskHoldService;
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

            // FIXED: If role is not in claims or is null/empty, fetch from database
            if (string.IsNullOrEmpty(userRole))
            {
                var user = await _context.Users.FindAsync(userId);
                if (user != null)
                {
                    userRole = user.Role.ToString();
                    userName = user.FullName;
                    _logger.LogInformation("Role fetched from database for user {UserId}: {Role}", userId, userRole);
                }
                else
                {
                    _logger.LogWarning("User {UserId} not found in database, defaulting to 'unknown' role", userId);
                    userRole = "unknown";
                }
            }

            return (userId, userName ?? "Unknown", userRole);
        }

        /// <summary>
        /// Check if user has Team Leader permissions
        /// Matches frontend role check: team_leader, teamleader, director, shop_tl, shoptl
        /// Also supports PascalCase enum format: TeamLeader, Director, ShopTL
        /// </summary>
        private bool IsTeamLeaderOrAbove(string userRole)
        {
            if (string.IsNullOrEmpty(userRole))
                return false;

            var role = userRole.ToLower().Replace("_", "");
            return role == "teamleader" || 
                   role == "teamlead" ||
                   role == "director" || 
                   role == "shoptl";
        }

        /// <summary>
        /// Check if user has Engineer role
        /// Handles multiple roles (comma-separated) and variations like "engineer", "eng"
        /// </summary>
        private bool IsEngineer(string userRole)
        {
            if (string.IsNullOrEmpty(userRole))
                return false;

            // Handle multiple roles (comma-separated)
            var roles = userRole.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                .Select(r => r.Trim().ToLower().Replace("_", ""))
                                .ToList();

            // Check if any role matches engineer variations
            return roles.Any(r => r == "engineer" || r == "eng");
        }

        /// <summary>
        /// Create a hold request for a task (Engineer only)
        /// When status changes to OnHold, date counts reset to zero
        /// </summary>
        [HttpPost("tasks/{taskId}/request-hold")]
        public async Task<ActionResult<TaskHoldRequestDto>> RequestHold(
            int taskId,
            [FromBody] CreateTaskHoldRequestDto request,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                _logger.LogInformation("Hold request received for task {TaskId} by user {UserId} ({UserName}, {UserRole})",
                    taskId, userId, userName, userRole);

                // FIXED: Use IsEngineer helper to handle multiple roles
                if (!IsEngineer(userRole))
                {
                    _logger.LogWarning("Hold request denied for user {UserId} with role {UserRole} (not an engineer)",
                        userId, userRole);
                    return StatusCode(403, new { error = "Only engineers can request task holds" });
                }

                if (string.IsNullOrWhiteSpace(request.HoldReason))
                {
                    return BadRequest(new { error = "Hold reason is required" });
                }

                var result = await _taskHoldService.CreateHoldRequestAsync(
                    taskId,
                    userId,
                    request.HoldReason,
                    cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to create hold request";
                    return BadRequest(new { error = errorMessage });
                }

                _logger.LogInformation("Hold request created successfully for task {TaskId}. Days worked: {Days}",
                    taskId, result.Payload!.DaysWorkedByEngineer);

                return Ok(new
                {
                    success = true,
                    message = $"Hold request submitted. Task status changed to OnHold. Your {result.Payload.DaysWorkedByEngineer} work days have been recorded and reset to zero pending Team Lead approval.",
                    holdRequest = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating hold request for task {TaskId}", taskId);
                return StatusCode(500, new { error = "An error occurred while creating hold request", details = ex.Message });
            }
        }

        /// <summary>
        /// Review a hold request (Team Leader only)
        /// Approve: transfer dates to TL, return to initiator, or maintain status
        /// Reject: restore engineer's dates and return task to InProgress
        /// </summary>
        [HttpPost("{holdRequestId}/review")]
        public async Task<ActionResult<TaskHoldRequestDto>> ReviewHoldRequest(
            int holdRequestId,
            [FromBody] ReviewTaskHoldRequestDto request,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                _logger.LogInformation("Hold request review received for request {HoldRequestId} by user {UserId} ({UserName}, {UserRole})",
                    holdRequestId, userId, userName, userRole);

                if (!IsTeamLeaderOrAbove(userRole))
                {
                    return StatusCode(403, new { error = "Only Team Leaders can review hold requests" });
                }

                if (string.IsNullOrWhiteSpace(request.Decision))
                {
                    return BadRequest(new { error = "Decision is required (approve or reject)" });
                }

                if (request.Decision.ToLower() == "approve" && string.IsNullOrWhiteSpace(request.Action))
                {
                    return BadRequest(new { error = "Action is required when approving (transfer_to_tl, return_to_initiator, or maintain_status)" });
                }

                var result = await _taskHoldService.ReviewHoldRequestAsync(
                    holdRequestId,
                    userId,
                    request.Decision,
                    request.Action,
                    request.ReviewComments,
                    cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to review hold request";
                    return BadRequest(new { error = errorMessage });
                }

                var payload = result.Payload!;
                string message;

                if (request.Decision.ToLower() == "approve")
                {
                    switch (request.Action?.ToLower())
                    {
                        case "transfer_to_tl":
                            message = $"Hold request approved. {payload.DaysWorkedByEngineer} days transferred to your account. Task assigned to you.";
                            break;
                        case "return_to_initiator":
                            message = "Hold request approved. Task returned to initiator for reprocessing.";
                            break;
                        case "maintain_status":
                            message = "Hold request approved. Task status maintained as OnHold.";
                            break;
                        default:
                            message = "Hold request approved.";
                            break;
                    }
                }
                else
                {
                    message = $"Hold request rejected. Engineer's {payload.DaysWorkedByEngineer} days restored. Task returned to InProgress.";
                }

                _logger.LogInformation("Hold request {HoldRequestId} reviewed: {Decision}, Action: {Action}",
                    holdRequestId, request.Decision, request.Action);

                return Ok(new
                {
                    success = true,
                    message = message,
                    holdRequest = payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reviewing hold request {HoldRequestId}", holdRequestId);
                return StatusCode(500, new { error = "An error occurred while reviewing hold request", details = ex.Message });
            }
        }

        /// <summary>
        /// Get all pending hold requests (Team Leader only)
        /// </summary>
        [HttpGet("pending")]
        public async Task<ActionResult<List<TaskHoldRequestDto>>> GetPendingHoldRequests(
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                _logger.LogInformation("Pending hold requests requested by user {UserId} ({UserName}, {UserRole})",
                    userId, userName, userRole);

                if (!IsTeamLeaderOrAbove(userRole))
                {
                    _logger.LogWarning("Access denied for user {UserId} with role {UserRole}", userId, userRole);
                    return StatusCode(403, new { error = "Only Team Leaders can view pending hold requests" });
                }

                var result = await _taskHoldService.GetPendingHoldRequestsAsync(userId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get pending hold requests";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    holdRequests = result.Payload,
                    count = result.Payload?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting pending hold requests");
                return StatusCode(500, new { error = "An error occurred while getting pending hold requests", details = ex.Message });
            }
        }

        /// <summary>
        /// Get hold requests for a specific task
        /// </summary>
        [HttpGet("tasks/{taskId}")]
        public async Task<ActionResult<List<TaskHoldRequestDto>>> GetTaskHoldRequests(
            int taskId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _taskHoldService.GetHoldRequestsByTaskIdAsync(taskId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get hold requests";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    holdRequests = result.Payload,
                    count = result.Payload?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting hold requests for task {TaskId}", taskId);
                return StatusCode(500, new { error = "An error occurred while getting hold requests", details = ex.Message });
            }
        }

        /// <summary>
        /// Get date counts for current user
        /// </summary>
        [HttpGet("date-counts")]
        public async Task<ActionResult<List<UserDateCountDto>>> GetMyDateCounts(
            [FromQuery] int? taskId = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();

                var result = await _taskHoldService.GetUserDateCountsAsync(userId, taskId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get date counts";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    dateCounts = result.Payload,
                    totalDays = result.Payload?.Sum(dc => dc.DateCount) ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting date counts for user");
                return StatusCode(500, new { error = "An error occurred while getting date counts", details = ex.Message });
            }
        }

        /// <summary>
        /// Get date counts for a specific user (Team Leader and above)
        /// </summary>
        [HttpGet("users/{userId}/date-counts")]
        public async Task<ActionResult<List<UserDateCountDto>>> GetUserDateCounts(
            int userId,
            [FromQuery] int? taskId = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (currentUserId, userName, userRole) = await GetCurrentUserAsync();

                if (!IsTeamLeaderOrAbove(userRole) && 
                    userRole.ToLower() != "manager")
                {
                    return StatusCode(403, new { error = "Only Team Leaders, Managers, and Directors can view other users' date counts" });
                }

                var result = await _taskHoldService.GetUserDateCountsAsync(userId, taskId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get date counts";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    dateCounts = result.Payload,
                    totalDays = result.Payload?.Sum(dc => dc.DateCount) ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting date counts for user {UserId}", userId);
                return StatusCode(500, new { error = "An error occurred while getting date counts", details = ex.Message });
            }
        }

        /// <summary>
        /// Get distinct task IDs where the specified engineer has submitted hold requests.
        /// This endpoint is used by the frontend RBAC filter to ensure engineers retain
        /// visibility of tasks after hold approval changes the assignment.
        /// Accessible by the engineer themselves, or by Team Leaders and above.
        /// </summary>
        [HttpGet("engineer/{engineerId}/task-ids")]
        public async Task<ActionResult<List<int>>> GetEngineerHoldTaskIds(
            int engineerId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var (currentUserId, userName, userRole) = await GetCurrentUserAsync();

                // Allow the engineer themselves or Team Leaders and above
                if (currentUserId != engineerId && !IsTeamLeaderOrAbove(userRole))
                {
                    return StatusCode(403, new { error = "You can only view your own hold request task IDs, or you must be a Team Leader or above" });
                }

                var result = await _taskHoldService.GetTaskIdsByEngineerHoldRequestsAsync(engineerId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to get task IDs";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    taskIds = result.Payload,
                    count = result.Payload?.Count ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting hold request task IDs for engineer {EngineerId}", engineerId);
                return StatusCode(500, new { error = "An error occurred while getting hold request task IDs", details = ex.Message });
            }
        }

        /// <summary>
        /// Calculate days worked by engineer on a task
        /// </summary>
        [HttpGet("tasks/{taskId}/engineers/{engineerId}/days-worked")]
        public async Task<ActionResult<int>> CalculateDaysWorked(
            int taskId,
            int engineerId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _taskHoldService.CalculateDaysWorkedAsync(taskId, engineerId, cancellationToken);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to calculate days worked";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new
                {
                    success = true,
                    daysWorked = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating days worked for task {TaskId} and engineer {EngineerId}", taskId, engineerId);
                return StatusCode(500, new { error = "An error occurred while calculating days worked", details = ex.Message });
            }
        }
    }
}