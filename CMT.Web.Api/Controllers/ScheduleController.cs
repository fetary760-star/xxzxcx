using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMT.Web.Api.Controllers;

/// <summary>
/// REST API controller for employee schedule management.
/// Supports CRUD, approval workflow, conflict detection, and bulk generation.
///
/// Routes:
///   GET    /api/employee-schedules              — List schedules (filterable)
///   GET    /api/employee-schedules/{id}          — Get single schedule
///   POST   /api/employee-schedules               — Create schedule
///   PUT    /api/employee-schedules/{id}           — Update schedule
///   DELETE /api/employee-schedules/{id}           — Delete schedule
///   PATCH  /api/employee-schedules/{id}/approve   — Approve schedule
///   GET    /api/employee-schedules/range           — Get schedules by date range
///   POST   /api/employee-schedules/conflict-check  — Check for conflicts
/// </summary>
[ApiController]
[Route("api/employee-schedules")]
[Authorize]
public class ScheduleController : ControllerBase
{
    private readonly IScheduleService _scheduleService;
    private readonly ILogger<ScheduleController> _logger;

    public ScheduleController(IScheduleService scheduleService, ILogger<ScheduleController> logger)
    {
        _scheduleService = scheduleService;
        _logger          = logger;
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/employee-schedules
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetSchedules(
        [FromQuery] DateTime? weekStarting = null,
        [FromQuery] int? userId = null,
        [FromQuery] string? status = null,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 50)
    {
        try
        {
            var (schedules, totalCount) = await _scheduleService.GetSchedulesAsync(
                weekStarting, userId, status, pageNumber, pageSize);

            var dtos = schedules.Select(MapToDto).ToList();

            return Ok(new
            {
                data       = dtos,
                totalCount,
                pageNumber,
                pageSize,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching schedules");
            return StatusCode(500, new { error = "Failed to fetch schedules", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/employee-schedules/{id}
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetScheduleById(int id)
    {
        try
        {
            var schedule = await _scheduleService.GetScheduleByIdAsync(id);
            if (schedule == null)
                return NotFound(new { error = $"Schedule {id} not found" });

            return Ok(MapToDto(schedule));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching schedule {Id}", id);
            return StatusCode(500, new { error = "Failed to fetch schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/employee-schedules
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateSchedule([FromBody] CreateScheduleDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Check for conflicts
            var hasConflict = await _scheduleService.CheckScheduleConflictAsync(
                dto.UserId, dto.ScheduleDate, dto.StartTime, dto.EndTime);

            if (hasConflict)
                return Conflict(new { error = "Schedule conflict detected for this user on the specified date and time." });

            var schedule = new EmployeeSchedule
            {
                UserId       = dto.UserId,
                ScheduleDate = dto.ScheduleDate,
                StartTime    = dto.StartTime,
                EndTime      = dto.EndTime,
                ShiftType    = dto.ShiftType,
                Comments     = dto.Comments,
            };

            var created = await _scheduleService.CreateScheduleAsync(schedule);
            return CreatedAtAction(nameof(GetScheduleById), new { id = created.ScheduleId }, MapToDto(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating schedule");
            return StatusCode(500, new { error = "Failed to create schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // PUT /api/employee-schedules/{id}
    // ─────────────────────────────────────────────────────────────────────
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateSchedule(int id, [FromBody] UpdateScheduleDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var schedule = new EmployeeSchedule
            {
                ScheduleId   = id,
                ScheduleDate = dto.ScheduleDate,
                StartTime    = dto.StartTime,
                EndTime      = dto.EndTime,
                ShiftType    = dto.ShiftType,
                Comments     = dto.Comments,
            };

            var updated = await _scheduleService.UpdateScheduleAsync(schedule);
            return Ok(MapToDto(updated));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = $"Schedule {id} not found" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating schedule {Id}", id);
            return StatusCode(500, new { error = "Failed to update schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // DELETE /api/employee-schedules/{id}
    // ─────────────────────────────────────────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteSchedule(int id)
    {
        try
        {
            var deleted = await _scheduleService.DeleteScheduleAsync(id);
            if (!deleted)
                return NotFound(new { error = $"Schedule {id} not found" });

            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting schedule {Id}", id);
            return StatusCode(500, new { error = "Failed to delete schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // PATCH /api/employee-schedules/{id}/approve
    // ─────────────────────────────────────────────────────────────────────
    [HttpPatch("{id:int}/approve")]
    public async Task<IActionResult> ApproveSchedule(int id)
    {
        try
        {
            // Extract the approver's user ID from the JWT claims
            var userIdClaim = User.FindFirst("userId")?.Value
                           ?? User.FindFirst("user_id")?.Value
                           ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

            if (!int.TryParse(userIdClaim, out var approvedByUserId))
                return Unauthorized(new { error = "Unable to determine approver identity" });

            var approved = await _scheduleService.ApproveScheduleAsync(id, approvedByUserId);
            return Ok(MapToDto(approved));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = $"Schedule {id} not found" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving schedule {Id}", id);
            return StatusCode(500, new { error = "Failed to approve schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/employee-schedules/range?startDate=...&endDate=...
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("range")]
    public async Task<IActionResult> GetSchedulesByRange(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        try
        {
            var schedules = await _scheduleService.GetSchedulesByDateRangeAsync(startDate, endDate);
            var dtos = schedules.Select(MapToDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching schedules by range");
            return StatusCode(500, new { error = "Failed to fetch schedules", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/employee-schedules/conflict-check
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost("conflict-check")]
    public async Task<IActionResult> CheckConflict([FromBody] ConflictCheckRequest request)
    {
        try
        {
            var hasConflict = await _scheduleService.CheckScheduleConflictAsync(
                request.UserId,
                request.ScheduleDate,
                request.StartTime,
                request.EndTime,
                request.ExcludeScheduleId);

            return Ok(new { hasConflict });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking schedule conflict");
            return StatusCode(500, new { error = "Failed to check conflict", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────

    private static EmployeeScheduleDto MapToDto(EmployeeSchedule s) => new()
    {
        ScheduleId     = s.ScheduleId,
        UserId         = s.UserId,
        EmployeeName   = s.User?.FullName ?? string.Empty,
        ScheduleDate   = s.ScheduleDate,
        StartTime      = s.StartTime,
        EndTime        = s.EndTime,
        ShiftType      = s.ShiftType,
        Comments       = s.Comments,
        Status         = s.Status,
        ApprovedBy     = s.ApprovedBy,
        ApprovedByName = s.Approver?.FullName,
        ApprovalDate   = s.ApprovalDate,
        CreatedAt      = s.CreatedAt,
        UpdatedAt      = s.UpdatedAt,
    };
}

/// <summary>
/// Request body for the conflict-check endpoint.
/// </summary>
public class ConflictCheckRequest
{
    public int UserId { get; set; }
    public DateTime ScheduleDate { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public int? ExcludeScheduleId { get; set; }
}