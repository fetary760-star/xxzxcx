using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMT.Web.Api.Controllers;

/// <summary>
/// REST API controller for engineer workload dashboard, schedule analysis,
/// and automated schedule generation.
///
/// Routes:
///   GET  /api/workload                  — All engineer workloads
///   GET  /api/workload/summary          — Aggregated workload summary
///   GET  /api/workload/accessible       — Filtered workload for accessible engineers only
///   GET  /api/workload/{userId}         — Single engineer workload
///   GET  /api/workload/trend            — Workload trend over date range
///   POST /api/workload/analyze          — Schedule analysis (fairness, utilization)
///   POST /api/workload/generate-schedule — Automated schedule generation
/// </summary>
[ApiController]
[Route("api/workload")]
[Authorize]
public class WorkloadController : ControllerBase
{
    private readonly IWorkloadService _workloadService;
    private readonly ILogger<WorkloadController> _logger;

    public WorkloadController(IWorkloadService workloadService, ILogger<WorkloadController> logger)
    {
        _workloadService = workloadService;
        _logger          = logger;
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/workload
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAllWorkloads()
    {
        try
        {
            var workloads = await _workloadService.GetEngineerWorkloadAsync();
            return Ok(workloads);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching engineer workloads");
            return StatusCode(500, new { error = "Failed to fetch workloads", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/workload/summary
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("summary")]
    public async Task<IActionResult> GetWorkloadSummary()
    {
        try
        {
            var summary = await _workloadService.GetWorkloadSummaryAsync();
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching workload summary");
            return StatusCode(500, new { error = "Failed to fetch workload summary", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/workload/accessible?engineers=Name1&engineers=Name2
    // Returns filtered workload data for only the specified accessible engineers,
    // with category distribution, status breakdown, and urgency prioritization.
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("accessible")]
    public async Task<IActionResult> GetAccessibleEngineerWorkload([FromQuery] List<string> engineers)
    {
        try
        {
            if (engineers == null || !engineers.Any())
            {
                return BadRequest(new { error = "At least one engineer name must be specified via the 'engineers' query parameter." });
            }

            var result = await _workloadService.GetAccessibleEngineerWorkloadAsync(engineers);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching accessible engineer workload");
            return StatusCode(500, new { error = "Failed to fetch accessible engineer workload", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/workload/{userId}
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("{userId:int}")]
    public async Task<IActionResult> GetEngineerWorkload(int userId)
    {
        try
        {
            var workload = await _workloadService.GetEngineerWorkloadByIdAsync(userId);
            if (workload == null)
                return NotFound(new { error = $"Engineer with user ID {userId} not found" });

            return Ok(workload);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching workload for user {UserId}", userId);
            return StatusCode(500, new { error = "Failed to fetch workload", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET /api/workload/trend?startDate=...&endDate=...
    // ─────────────────────────────────────────────────────────────────────
    [HttpGet("trend")]
    public async Task<IActionResult> GetWorkloadTrend(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        try
        {
            if (endDate < startDate)
                return BadRequest(new { error = "endDate must be after startDate" });

            var trend = await _workloadService.GetWorkloadTrendAsync(startDate, endDate);
            return Ok(trend);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching workload trend");
            return StatusCode(500, new { error = "Failed to fetch workload trend", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/workload/analyze
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost("analyze")]
    public async Task<IActionResult> AnalyzeSchedule([FromBody] ScheduleAnalysisRequest request)
    {
        try
        {
            if (request.EndDate < request.StartDate)
                return BadRequest(new { error = "endDate must be after startDate" });

            var analysis = await _workloadService.AnalyzeScheduleAsync(request.StartDate, request.EndDate);
            return Ok(analysis);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analyzing schedule");
            return StatusCode(500, new { error = "Failed to analyze schedule", message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST /api/workload/generate-schedule
    // ─────────────────────────────────────────────────────────────────────
    [HttpPost("generate-schedule")]
    public async Task<IActionResult> GenerateSchedule([FromBody] ScheduleGenerationRequestDto request)
    {
        try
        {
            if (request.EndDate < request.StartDate)
                return BadRequest(new { error = "endDate must be after startDate" });

            var result = await _workloadService.GenerateScheduleAsync(request);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating schedule");
            return StatusCode(500, new { error = "Failed to generate schedule", message = ex.Message });
        }
    }
}

/// <summary>
/// Request body for the schedule analysis endpoint.
/// </summary>
public class ScheduleAnalysisRequest
{
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
}