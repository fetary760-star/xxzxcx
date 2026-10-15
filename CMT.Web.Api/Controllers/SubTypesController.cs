using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Web.Api.Controllers;

[ApiController]
[Route("api/reference-data/sub-types")]
public class SubTypesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<SubTypesController> _logger;

    public SubTypesController(ApplicationDbContext context, ILogger<SubTypesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetSubTypes()
    {
        try
        {
            var subTypes = await _context.TaskSubTypes
                .Include(s => s.Category)
                .Where(s => s.RecordStatus == RecordStatus.Active)
                .Select(s => new
                {
                    sub_type_id = s.SubTypeId,
                    id = s.SubTypeId,
                    name = s.Name,
                    description = s.Description,
                    category_id = s.CategoryId,
                    category_name = s.Category.Name,
                    category = new { id = s.Category.CategoryId, name = s.Category.Name }
                })
                .ToListAsync();

            return Ok(subTypes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching sub types");
            return StatusCode(500, new { error = "Failed to retrieve sub types" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateSubType([FromBody] CreateSubTypeRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { error = "Sub type name is required" });
            }

            if (request.CategoryId <= 0)
            {
                return BadRequest(new { error = "Valid category ID is required" });
            }

            var categoryExists = await _context.TaskCategories
                .AnyAsync(c => c.CategoryId == request.CategoryId && c.RecordStatus == RecordStatus.Active);

            if (!categoryExists)
            {
                return BadRequest(new { error = "Category not found" });
            }

            var exists = await _context.TaskSubTypes
                .AnyAsync(s => s.Name == request.Name && s.CategoryId == request.CategoryId && s.RecordStatus == RecordStatus.Active);

            if (exists)
            {
                return Conflict(new { error = "Sub type with this name already exists in this category" });
            }

            var subType = new TaskSubType
            {
                Name = request.Name,
                Description = request.Description,
                CategoryId = request.CategoryId,
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

            _context.TaskSubTypes.Add(subType);
            await _context.SaveChangesAsync();

            var category = await _context.TaskCategories.FindAsync(request.CategoryId);

            return Ok(new
            {
                sub_type_id = subType.SubTypeId,
                id = subType.SubTypeId,
                name = subType.Name,
                description = subType.Description,
                category_id = subType.CategoryId,
                category_name = category?.Name
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating sub type");
            return StatusCode(500, new { error = "Failed to create sub type" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateSubType(int id, [FromBody] UpdateSubTypeRequest request)
    {
        try
        {
            var subType = await _context.TaskSubTypes
                .Include(s => s.Category)
                .FirstOrDefaultAsync(s => s.SubTypeId == id && s.RecordStatus == RecordStatus.Active);

            if (subType == null)
            {
                return NotFound(new { error = "Sub type not found" });
            }

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var exists = await _context.TaskSubTypes
                    .AnyAsync(s => s.Name == request.Name && s.CategoryId == (request.CategoryId ?? subType.CategoryId) 
                        && s.SubTypeId != id && s.RecordStatus == RecordStatus.Active);

                if (exists)
                {
                    return Conflict(new { error = "Sub type with this name already exists in this category" });
                }

                subType.Name = request.Name;
            }

            if (request.CategoryId.HasValue && request.CategoryId.Value > 0)
            {
                var categoryExists = await _context.TaskCategories
                    .AnyAsync(c => c.CategoryId == request.CategoryId.Value && c.RecordStatus == RecordStatus.Active);

                if (!categoryExists)
                {
                    return BadRequest(new { error = "Category not found" });
                }

                subType.CategoryId = request.CategoryId.Value;
            }

            if (request.Description != null)
            {
                subType.Description = request.Description;
            }

            subType.UpdatedAt = DateTime.UtcNow;
            subType.LastUpdateDate = DateTime.UtcNow;
            subType.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new
            {
                sub_type_id = subType.SubTypeId,
                id = subType.SubTypeId,
                name = subType.Name,
                description = subType.Description,
                category_id = subType.CategoryId,
                category_name = subType.Category.Name
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating sub type");
            return StatusCode(500, new { error = "Failed to update sub type" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSubType(int id)
    {
        try
        {
            var subType = await _context.TaskSubTypes
                .FirstOrDefaultAsync(s => s.SubTypeId == id && s.RecordStatus == RecordStatus.Active);

            if (subType == null)
            {
                return NotFound(new { error = "Sub type not found" });
            }

            // Soft delete
            subType.RecordStatus = RecordStatus.Deleted;
            subType.UpdatedAt = DateTime.UtcNow;
            subType.LastUpdateDate = DateTime.UtcNow;
            subType.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new { message = "Sub type deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting sub type");
            return StatusCode(500, new { error = "Failed to delete sub type" });
        }
    }
}

public class CreateSubTypeRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int CategoryId { get; set; }
}

public class UpdateSubTypeRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int? CategoryId { get; set; }
}