using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Web.Api.Controllers;

[ApiController]
[Route("api/reference-data/category-target-days")]
public class CategoryTargetDaysController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CategoryTargetDaysController> _logger;

    public CategoryTargetDaysController(ApplicationDbContext context, ILogger<CategoryTargetDaysController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetCategoryTargetDays()
    {
        try
        {
            var targetDays = await _context.TaskCategoryTargetDays
                .Include(t => t.Category)
                .Where(t => t.RecordStatus == RecordStatus.Active && t.Category.RecordStatus == RecordStatus.Active)
                .Select(t => new
                {
                    target_id = t.TargetId,
                    id = t.TargetId,
                    category_id = t.CategoryId,
                    category_name = t.Category.Name,
                    target_days = t.TargetDays,
                    targetDays = t.TargetDays,
                    target_hours = t.TargetHours,
                    targetHours = t.TargetHours,
                    target_minutes = t.TargetMinutes,
                    targetMinutes = t.TargetMinutes,
                    category = new { id = t.Category.CategoryId, name = t.Category.Name }
                })
                .ToListAsync();

            return Ok(targetDays);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching category target days");
            return StatusCode(500, new { error = "Failed to retrieve category target days" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateOrUpdateCategoryTargetDays([FromBody] CreateTargetDaysRequest request)
    {
        try
        {
            if (request.CategoryId <= 0)
            {
                return BadRequest(new { error = "Valid category ID is required" });
            }

            if (request.TargetDays < 0)
            {
                return BadRequest(new { error = "Target days cannot be negative" });
            }

            if (request.TargetHours < 0 || request.TargetHours > 23)
            {
                return BadRequest(new { error = "Target hours must be between 0 and 23" });
            }

            if (request.TargetMinutes < 0 || request.TargetMinutes > 59)
            {
                return BadRequest(new { error = "Target minutes must be between 0 and 59" });
            }

            // At least one duration component must be greater than 0
            if (request.TargetDays <= 0 && request.TargetHours <= 0 && request.TargetMinutes <= 0)
            {
                return BadRequest(new { error = "At least one of Target Days, Hours, or Minutes must be greater than 0" });
            }

            var categoryExists = await _context.TaskCategories
                .AnyAsync(c => c.CategoryId == request.CategoryId && c.RecordStatus == RecordStatus.Active);

            if (!categoryExists)
            {
                return BadRequest(new { error = "Category not found" });
            }

            // Check if target days already exist for this category
            var existingTargetDays = await _context.TaskCategoryTargetDays
                .Include(t => t.Category)
                .FirstOrDefaultAsync(t => t.CategoryId == request.CategoryId && t.RecordStatus == RecordStatus.Active);

            if (existingTargetDays != null)
            {
                // Update existing
                existingTargetDays.TargetDays = request.TargetDays;
                existingTargetDays.TargetHours = request.TargetHours;
                existingTargetDays.TargetMinutes = request.TargetMinutes;
                existingTargetDays.UpdatedAt = DateTime.UtcNow;
                existingTargetDays.LastUpdateDate = DateTime.UtcNow;
                existingTargetDays.UpdatedBy = "System";

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    target_id = existingTargetDays.TargetId,
                    id = existingTargetDays.TargetId,
                    category_id = existingTargetDays.CategoryId,
                    category_name = existingTargetDays.Category.Name,
                    target_days = existingTargetDays.TargetDays,
                    targetDays = existingTargetDays.TargetDays,
                    target_hours = existingTargetDays.TargetHours,
                    targetHours = existingTargetDays.TargetHours,
                    target_minutes = existingTargetDays.TargetMinutes,
                    targetMinutes = existingTargetDays.TargetMinutes
                });
            }

            // Create new
            var targetDays = new TaskCategoryTargetDay
            {
                CategoryId = request.CategoryId,
                TargetDays = request.TargetDays,
                TargetHours = request.TargetHours,
                TargetMinutes = request.TargetMinutes,
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

            _context.TaskCategoryTargetDays.Add(targetDays);
            await _context.SaveChangesAsync();

            var category = await _context.TaskCategories.FindAsync(request.CategoryId);

            return Ok(new
            {
                target_id = targetDays.TargetId,
                id = targetDays.TargetId,
                category_id = targetDays.CategoryId,
                category_name = category?.Name,
                target_days = targetDays.TargetDays,
                targetDays = targetDays.TargetDays,
                target_hours = targetDays.TargetHours,
                targetHours = targetDays.TargetHours,
                target_minutes = targetDays.TargetMinutes,
                targetMinutes = targetDays.TargetMinutes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating/updating category target days");
            return StatusCode(500, new { error = "Failed to save category target days" });
        }
    }

    [HttpPut("{categoryId}")]
    public async Task<IActionResult> UpdateCategoryTargetDays(int categoryId, [FromBody] UpdateTargetDaysRequest request)
    {
        try
        {
            var targetDays = await _context.TaskCategoryTargetDays
                .Include(t => t.Category)
                .FirstOrDefaultAsync(t => t.CategoryId == categoryId && t.RecordStatus == RecordStatus.Active);

            if (targetDays == null)
            {
                return NotFound(new { error = "Category target days not found" });
            }

            if (request.TargetDays.HasValue)
            {
                if (request.TargetDays.Value < 0)
                {
                    return BadRequest(new { error = "Target days cannot be negative" });
                }
                targetDays.TargetDays = request.TargetDays.Value;
            }

            if (request.TargetHours.HasValue)
            {
                if (request.TargetHours.Value < 0 || request.TargetHours.Value > 23)
                {
                    return BadRequest(new { error = "Target hours must be between 0 and 23" });
                }
                targetDays.TargetHours = request.TargetHours.Value;
            }

            if (request.TargetMinutes.HasValue)
            {
                if (request.TargetMinutes.Value < 0 || request.TargetMinutes.Value > 59)
                {
                    return BadRequest(new { error = "Target minutes must be between 0 and 59" });
                }
                targetDays.TargetMinutes = request.TargetMinutes.Value;
            }

            // After applying updates, ensure at least one duration component is > 0
            var finalDays = request.TargetDays ?? targetDays.TargetDays;
            var finalHours = request.TargetHours ?? targetDays.TargetHours;
            var finalMinutes = request.TargetMinutes ?? targetDays.TargetMinutes;
            if (finalDays <= 0 && finalHours <= 0 && finalMinutes <= 0)
            {
                return BadRequest(new { error = "At least one of Target Days, Hours, or Minutes must be greater than 0" });
            }

            targetDays.UpdatedAt = DateTime.UtcNow;
            targetDays.LastUpdateDate = DateTime.UtcNow;
            targetDays.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new
            {
                target_id = targetDays.TargetId,
                id = targetDays.TargetId,
                category_id = targetDays.CategoryId,
                category_name = targetDays.Category.Name,
                target_days = targetDays.TargetDays,
                targetDays = targetDays.TargetDays,
                target_hours = targetDays.TargetHours,
                targetHours = targetDays.TargetHours,
                target_minutes = targetDays.TargetMinutes,
                targetMinutes = targetDays.TargetMinutes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category target days");
            return StatusCode(500, new { error = "Failed to update category target days" });
        }
    }

    [HttpDelete("{categoryId}")]
    public async Task<IActionResult> DeleteCategoryTargetDays(int categoryId)
    {
        try
        {
            var targetDays = await _context.TaskCategoryTargetDays
                .FirstOrDefaultAsync(t => t.CategoryId == categoryId && t.RecordStatus == RecordStatus.Active);

            if (targetDays == null)
            {
                return NotFound(new { error = "Category target days not found" });
            }

            // Soft delete
            targetDays.RecordStatus = RecordStatus.Deleted;
            targetDays.UpdatedAt = DateTime.UtcNow;
            targetDays.LastUpdateDate = DateTime.UtcNow;
            targetDays.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new { message = "Category target days deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting category target days");
            return StatusCode(500, new { error = "Failed to delete category target days" });
        }
    }
}

public class CreateTargetDaysRequest
{
    public int CategoryId { get; set; }
    public int TargetDays { get; set; }
    public int TargetHours { get; set; } = 0;
    public int TargetMinutes { get; set; } = 0;
}

public class UpdateTargetDaysRequest
{
    public int? TargetDays { get; set; }
    public int? TargetHours { get; set; }
    public int? TargetMinutes { get; set; }
}