using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers;

/// <summary>
/// REST API controller for workload adjustment requests.
/// Engineers can request additional estimated hours for tasks they find overloaded.
/// Team Leaders can approve or reject these requests.
///
/// Routes:
///   POST   /api/workload-adjustment                     — Engineer creates a new adjustment request
///   PUT    /api/workload-adjustment/{id}/review          — Team Leader reviews (approve/reject) a request
///   GET    /api/workload-adjustment/pending               — Get all pending requests (for TL dashboard)
///   GET    /api/workload-adjustment/engineer/{engineerId} — Get requests by engineer
///   GET    /api/workload-adjustment/task/{taskId}         — Get requests by task
///   GET    /api/workload-adjustment/{id}                  — Get a single request by ID
/// </summary>
[ApiController]
[Route("api/workload-adjustment")]
[Authorize]
public class WorkloadAdjustmentController : ControllerBase
{
    private readonly IWorkloadAdjustmentService _adjustmentService;
    private readonly ILogger<WorkloadAdjustmentController> _logger;

    public WorkloadAdjustmentController(
        IWorkloadAdjustmentService adjustmentService,
        ILogger<WorkloadAdjustmentController> logger)
    {
        _adjustmentService = adjustmentService;
        _logger = logger;
    }

    /// <summary>
    /// Engineer creates a workload adjustment request for an assigned task.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateAdjustmentRequest([FromBody] CreateWorkloadAdjustmentDto request)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)) });

            var userId = GetCurrentUserId();
            if (userId == null)
                return Unauthorized(new { success = false, message = "User not authenticated" });

            var result = await _adjustmentService.CreateAdjustmentRequestAsync(userId.Value, request);

            if (!result.IsSuccess)
                return BadRequest(new { success = false, message = result.Errors?.FirstOrDefault() ?? "Request failed" });

            return Ok(new { success = true, message = result.Message, data = result.Payload });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating workload adjustment request");
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    /// <summary>
    /// Team Leader reviews (approves or rejects) a workload adjustment request.
    /// </summary>
    [HttpPut("{id:int}/review")]
    public async Task<IActionResult> ReviewAdjustmentRequest(int id, [FromBody] ReviewWorkloadAdjustmentDto review)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)) });

            var userId = GetCurrentUserId();
            if (userId == null)
                return Unauthorized(new { success = false, message = "User not authenticated" });

            var result = await _adjustmentService.ReviewAdjustmentRequestAsync(id, userId.Value, review);

            if (!result.IsSuccess)
                return BadRequest(new { success = false, message = result.Errors?.FirstOrDefault() ?? "Review failed" });

            return Ok(new { success = true, message = result.Message, data = result.Payload });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reviewing workload adjustment request {Id}", id);
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    /// <summary>
    /// Get all pending workload adjustment requests (for Team Leader dashboard).
    /// </summary>
    [HttpGet("pending")]
    public async Task<IActionResult> GetPendingRequests()
    {
        try
        {
            var result = await _adjustmentService.GetPendingAdjustmentRequestsAsync();

            if (!result.IsSuccess)
                return StatusCode(500, new { success = false, message = result.Errors?.FirstOrDefault() });

            return Ok(new { success = true, data = result.Payload, total_count = result.Payload?.Count ?? 0 });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending workload adjustment requests");
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    /// <summary>
    /// Get workload adjustment requests for a specific engineer.
    /// </summary>
    [HttpGet("engineer/{engineerId:int}")]
    public async Task<IActionResult> GetRequestsByEngineer(int engineerId)
    {
        try
        {
            var result = await _adjustmentService.GetAdjustmentRequestsByEngineerAsync(engineerId);

            if (!result.IsSuccess)
                return StatusCode(500, new { success = false, message = result.Errors?.FirstOrDefault() });

            return Ok(new { success = true, data = result.Payload, total_count = result.Payload?.Count ?? 0 });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting workload adjustment requests for engineer {EngineerId}", engineerId);
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    /// <summary>
    /// Get workload adjustment request history for a specific task.
    /// </summary>
    [HttpGet("task/{taskId:int}")]
    public async Task<IActionResult> GetRequestsByTask(int taskId)
    {
        try
        {
            var result = await _adjustmentService.GetAdjustmentRequestsByTaskAsync(taskId);

            if (!result.IsSuccess)
                return StatusCode(500, new { success = false, message = result.Errors?.FirstOrDefault() });

            return Ok(new { success = true, data = result.Payload, total_count = result.Payload?.Count ?? 0 });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting workload adjustment requests for task {TaskId}", taskId);
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    /// <summary>
    /// Get a single workload adjustment request by ID.
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetRequestById(int id)
    {
        try
        {
            var result = await _adjustmentService.GetAdjustmentRequestByIdAsync(id);

            if (!result.IsSuccess)
                return NotFound(new { success = false, message = result.Errors?.FirstOrDefault() });

            return Ok(new { success = true, data = result.Payload });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting workload adjustment request {Id}", id);
            return StatusCode(500, new { success = false, message = "Internal server error" });
        }
    }

    #region Private Helpers

    private int? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                       ?? User.FindFirst("UserId")?.Value
                       ?? User.FindFirst("sub")?.Value;

        if (int.TryParse(userIdClaim, out var userId))
            return userId;

        return null;
    }

    #endregion
}