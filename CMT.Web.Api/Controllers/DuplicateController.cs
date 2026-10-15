using CMT.Application.DTOs;
using CMT.Application.Services;
using CMT.Web.Api.Attributes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/duplicates")]
    [Authorize]
    public class DuplicateController : ControllerBase
    {
        private readonly IDuplicateDetectionService _duplicateService;
        private readonly ILogger<DuplicateController> _logger;

        public DuplicateController(
            IDuplicateDetectionService duplicateService,
            ILogger<DuplicateController> logger)
        {
            _duplicateService = duplicateService;
            _logger = logger;
        }

        private (int UserId, string UserName, string UserRole) GetCurrentUser()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                return (1, "System", "system");
            }

            return (userId, userName ?? "Unknown", userRole ?? "customer");
        }

        /// <summary>
        /// Check for duplicate tasks
        /// FIXED: Added validation to ensure at least one search field is provided
        /// </summary>
        [HttpPost("check")]
        public async Task<ActionResult<DuplicateCheckResponse>> CheckDuplicates([FromBody] DuplicateCheckRequest request)
        {
            try
            {
                _logger.LogInformation("Duplicate check requested for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                    request.SerialNumber, request.PartNumber);

                // FIXED: Validate that at least one search field is provided
                if (string.IsNullOrWhiteSpace(request.SerialNumber) && 
                    string.IsNullOrWhiteSpace(request.PartNumber) && 
                    string.IsNullOrWhiteSpace(request.PoNumber) &&
                    string.IsNullOrWhiteSpace(request.Description))
                {
                    return BadRequest(new { error = "At least one field (Serial Number, Part Number, PO Number, or Description) must be provided for duplicate checking" });
                }

                var result = await _duplicateService.CheckDuplicatesAsync(request);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Duplicate check failed";
                    _logger.LogWarning("Duplicate check failed: {Error}", errorMessage);
                    return BadRequest(new { error = errorMessage });
                }

                // FIXED: Always return 200 OK with the duplicate check response, even if duplicates are found
                return Ok(result.Payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking duplicates");
                return StatusCode(500, new { error = "An error occurred while checking duplicates", details = ex.Message });
            }
        }

        /// <summary>
        /// Advanced duplicate check with AI-like similarity detection
        /// </summary>
        [HttpPost("check/advanced")]
        public async Task<ActionResult<DuplicateCheckResponse>> AdvancedDuplicateCheck([FromBody] DuplicateCheckRequest request)
        {
            try
            {
                _logger.LogInformation("Advanced duplicate check requested for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                    request.SerialNumber, request.PartNumber);

                // FIXED: Validate that at least one search field is provided
                if (string.IsNullOrWhiteSpace(request.SerialNumber) && 
                    string.IsNullOrWhiteSpace(request.PartNumber) && 
                    string.IsNullOrWhiteSpace(request.PoNumber) &&
                    string.IsNullOrWhiteSpace(request.Description))
                {
                    return BadRequest(new { error = "At least one field must be provided for duplicate checking" });
                }

                var result = await _duplicateService.AdvancedDuplicateCheckAsync(request);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Advanced duplicate check failed";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(result.Payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in advanced duplicate check");
                return StatusCode(500, new { error = "An error occurred during advanced duplicate check", details = ex.Message });
            }
        }

        /// <summary>
        /// Get duplicate tasks with filtering and pagination
        /// </summary>
        [HttpGet]
        public async Task<ActionResult> GetDuplicateTasks([FromQuery] DuplicateFilterRequest request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                _logger.LogInformation("Getting duplicate tasks for user {UserId} with filters: ShowDuplicatesOnly={ShowDuplicatesOnly}", 
                    userId, request.ShowDuplicatesOnly);

                var result = await _duplicateService.GetDuplicateTasksAsync(request);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to get duplicate tasks";
                    return BadRequest(new { error = errorMessage });
                }

                var (duplicates, totalCount) = result.Payload;

                var response = new
                {
                    duplicates = duplicates,
                    pagination = new
                    {
                        page = request.Page,
                        limit = request.PageSize,
                        total = totalCount,
                        totalPages = (int)Math.Ceiling((double)totalCount / request.PageSize)
                    },
                    filters = new
                    {
                        showDuplicatesOnly = request.ShowDuplicatesOnly,
                        duplicateStatus = request.DuplicateStatus,
                        categoryId = request.CategoryId,
                        searchQuery = request.SearchQuery,
                        fromDate = request.FromDate,
                        toDate = request.ToDate
                    },
                    success = true
                };

                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate tasks");
                return StatusCode(500, new { error = "An error occurred while getting duplicate tasks", details = ex.Message });
            }
        }

        /// <summary>
        /// Process duplicate tasks (mark as duplicate, keep separate, merge)
        /// ENHANCED: Notes are now conditionally required based on action and task details
        /// </summary>
        [HttpPost("process")]
        public async Task<ActionResult> ProcessDuplicates([FromBody] ProcessDuplicateRequest request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();

                _logger.LogInformation("Processing duplicates: {TaskIds}, Action: {Action}, User: {UserId}", 
                    string.Join(",", request.TaskIds), request.Action, userId);

                if (request.TaskIds == null || !request.TaskIds.Any())
                {
                    return BadRequest(new { error = "Task IDs are required" });
                }

                // ENHANCED: Conditional notes validation
                // Notes are NOT required for "keep_separate" action
                // Notes ARE required for "mark_duplicate" and "merge" actions
                if (request.Action.ToLower() != "keep_separate" && string.IsNullOrWhiteSpace(request.Notes))
                {
                    return BadRequest(new { error = $"Notes are required when performing '{request.Action}' action" });
                }

                var result = await _duplicateService.ProcessDuplicatesAsync(request, userId);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to process duplicates";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new 
                { 
                    success = true, 
                    message = $"Successfully processed {request.TaskIds.Count} duplicate task(s) with action: {request.Action}",
                    processedTaskIds = request.TaskIds,
                    action = request.Action
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing duplicates");
                return StatusCode(500, new { error = "An error occurred while processing duplicates", details = ex.Message });
            }
        }

        /// <summary>
        /// Mark tasks as duplicates
        /// </summary>
        [HttpPost("mark")]
        public async Task<ActionResult> MarkAsDuplicate([FromBody] MarkDuplicateRequest request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();

                if (request.TaskIds == null || !request.TaskIds.Any())
                {
                    return BadRequest(new { error = "Task IDs are required" });
                }

                if (string.IsNullOrEmpty(request.Notes))
                {
                    return BadRequest(new { error = "Notes are required when marking tasks as duplicates" });
                }

                var result = await _duplicateService.MarkAsDuplicateAsync(request.TaskIds, request.Notes, userId);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to mark as duplicate";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new 
                { 
                    success = true, 
                    message = $"Successfully marked {request.TaskIds.Count} task(s) as duplicate",
                    markedTaskIds = request.TaskIds
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking tasks as duplicate");
                return StatusCode(500, new { error = "An error occurred while marking tasks as duplicate", details = ex.Message });
            }
        }

        /// <summary>
        /// Get duplicate alerts for the alerts section
        /// ENHANCED: Role-based access control
        /// </summary>
        [HttpGet("alerts")]
        public async Task<ActionResult<IEnumerable<DuplicateAlertDto>>> GetDuplicateAlerts()
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();

                // ENHANCED: Role-based access - Team leaders, directors, and engineers see all alerts
                var normalizedRole = userRole.ToLower().Replace(" ", "_").Replace("-", "_");
                var viewAllAlerts = new[] { "team_leader", "director", "engineer" }.Contains(normalizedRole);
                var filterUserId = viewAllAlerts ? null : (int?)userId;

                _logger.LogInformation("User {UserId} ({Role}) requesting duplicate alerts. ViewAll: {ViewAll}", 
                    userId, userRole, viewAllAlerts);

                var result = await _duplicateService.GetDuplicateAlertsAsync(filterUserId);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to get duplicate alerts";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(result.Payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate alerts");
                return StatusCode(500, new { error = "An error occurred while getting duplicate alerts", details = ex.Message });
            }
        }

        /// <summary>
        /// Mark duplicate alert as read
        /// </summary>
        [HttpPost("alerts/{alertId}/read")]
        public async Task<ActionResult> MarkAlertAsRead(int alertId)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();

                var result = await _duplicateService.MarkAlertAsReadAsync(alertId, userId);

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to mark alert as read";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(new { success = true, message = "Alert marked as read" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking alert as read");
                return StatusCode(500, new { error = "An error occurred while marking alert as read", details = ex.Message });
            }
        }

        /// <summary>
        /// Get duplicate statistics for dashboard
        /// </summary>
        [HttpGet("statistics")]
        public async Task<ActionResult<DuplicateStatistics>> GetDuplicateStatistics()
        {
            try
            {
                var result = await _duplicateService.GetDuplicateStatisticsAsync();

                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault()?.Message ?? "Failed to get duplicate statistics";
                    return BadRequest(new { error = errorMessage });
                }

                return Ok(result.Payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate statistics");
                return StatusCode(500, new { error = "An error occurred while getting duplicate statistics", details = ex.Message });
            }
        }
    }

    public class MarkDuplicateRequest
    {
        public List<int> TaskIds { get; set; } = new List<int>();
        public string Notes { get; set; } = string.Empty;
    }
}