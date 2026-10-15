using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Web.Api.Controllers;

[ApiController]
[Route("api/reference-data/priorities")]
public class PrioritiesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<PrioritiesController> _logger;

    public PrioritiesController(ApplicationDbContext context, ILogger<PrioritiesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetPriorities()
    {
        try
        {
            var priorities = await _context.TaskPriorityLevels
                .Where(p => p.RecordStatus == RecordStatus.Active)
                .OrderBy(p => p.OrderRank)
                .Select(p => new
                {
                    priority_id = p.PriorityId,
                    id = p.PriorityId,
                    level_name = p.LevelName,
                    name = p.LevelName,
                    description = p.Description,
                    order_rank = p.OrderRank
                })
                .ToListAsync();

            return Ok(priorities);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching priorities");
            return StatusCode(500, new { error = "Failed to retrieve priorities" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreatePriority([FromBody] CreatePriorityRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.LevelName))
            {
                return BadRequest(new { error = "Priority level name is required" });
            }

            var exists = await _context.TaskPriorityLevels
                .AnyAsync(p => p.LevelName == request.LevelName && p.RecordStatus == RecordStatus.Active);

            if (exists)
            {
                return Conflict(new { error = "Priority with this name already exists" });
            }

            // Get the next order rank
            var maxOrderRank = await _context.TaskPriorityLevels
                .Where(p => p.RecordStatus == RecordStatus.Active)
                .MaxAsync(p => (int?)p.OrderRank) ?? -1;

            var priority = new TaskPriorityLevel
            {
                LevelName = request.LevelName,
                Description = request.Description,
                OrderRank = maxOrderRank + 1,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                RegisteredBy = "System",
                RegisteredDate = DateTime.UtcNow,
                LastUpdateDate = DateTime.UtcNow,
                UpdatedBy = "System",
                StartDate = DateTime.UtcNow,
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.TaskPriorityLevels.Add(priority);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                priority_id = priority.PriorityId,
                id = priority.PriorityId,
                level_name = priority.LevelName,
                name = priority.LevelName,
                description = priority.Description,
                order_rank = priority.OrderRank
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating priority");
            return StatusCode(500, new { error = "Failed to create priority" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdatePriority(int id, [FromBody] UpdatePriorityRequest request)
    {
        try
        {
            var priority = await _context.TaskPriorityLevels
                .FirstOrDefaultAsync(p => p.PriorityId == id && p.RecordStatus == RecordStatus.Active);

            if (priority == null)
            {
                return NotFound(new { error = "Priority not found" });
            }

            if (!string.IsNullOrWhiteSpace(request.LevelName))
            {
                var exists = await _context.TaskPriorityLevels
                    .AnyAsync(p => p.LevelName == request.LevelName && p.PriorityId != id && p.RecordStatus == RecordStatus.Active);

                if (exists)
                {
                    return Conflict(new { error = "Priority with this name already exists" });
                }

                priority.LevelName = request.LevelName;
            }

            if (request.Description != null)
            {
                priority.Description = request.Description;
            }

            priority.UpdatedAt = DateTime.UtcNow;
            priority.LastUpdateDate = DateTime.UtcNow;
            priority.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new
            {
                priority_id = priority.PriorityId,
                id = priority.PriorityId,
                level_name = priority.LevelName,
                name = priority.LevelName,
                description = priority.Description,
                order_rank = priority.OrderRank
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating priority");
            return StatusCode(500, new { error = "Failed to update priority" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePriority(int id)
    {
        try
        {
            var priority = await _context.TaskPriorityLevels
                .FirstOrDefaultAsync(p => p.PriorityId == id && p.RecordStatus == RecordStatus.Active);

            if (priority == null)
            {
                return NotFound(new { error = "Priority not found" });
            }

            // Soft delete
            priority.RecordStatus = RecordStatus.Deleted;
            priority.UpdatedAt = DateTime.UtcNow;
            priority.LastUpdateDate = DateTime.UtcNow;
            priority.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new { message = "Priority deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting priority");
            return StatusCode(500, new { error = "Failed to delete priority" });
        }
    }
}

public class CreatePriorityRequest
{
    public string LevelName { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class UpdatePriorityRequest
{
    public string? LevelName { get; set; }
    public string? Description { get; set; }
}