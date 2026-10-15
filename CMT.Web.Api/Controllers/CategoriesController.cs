using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Web.Api.Controllers;

[ApiController]
[Route("api/reference-data/categories")]
public class CategoriesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CategoriesController> _logger;

    public CategoriesController(ApplicationDbContext context, ILogger<CategoriesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetCategories()
    {
        try
        {
            var categories = await _context.TaskCategories
                .Where(c => c.RecordStatus == RecordStatus.Active)
                .Select(c => new
                {
                    category_id = c.CategoryId,
                    id = c.CategoryId,
                    name = c.Name,
                    description = c.Description,
                    isActive = c.RecordStatus == RecordStatus.Active
                })
                .ToListAsync();

            return Ok(categories);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching categories");
            return StatusCode(500, new { error = "Failed to retrieve categories" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateCategory([FromBody] CreateCategoryRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { error = "Category name is required" });
            }

            var exists = await _context.TaskCategories
                .AnyAsync(c => c.Name == request.Name && c.RecordStatus == RecordStatus.Active);

            if (exists)
            {
                return Conflict(new { error = "Category with this name already exists" });
            }

            var category = new TaskCategory
            {
                Name = request.Name,
                Description = request.Description,
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

            _context.TaskCategories.Add(category);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                category_id = category.CategoryId,
                id = category.CategoryId,
                name = category.Name,
                description = category.Description
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating category");
            return StatusCode(500, new { error = "Failed to create category" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCategory(int id, [FromBody] UpdateCategoryRequest request)
    {
        try
        {
            var category = await _context.TaskCategories
                .FirstOrDefaultAsync(c => c.CategoryId == id && c.RecordStatus == RecordStatus.Active);

            if (category == null)
            {
                return NotFound(new { error = "Category not found" });
            }

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var exists = await _context.TaskCategories
                    .AnyAsync(c => c.Name == request.Name && c.CategoryId != id && c.RecordStatus == RecordStatus.Active);

                if (exists)
                {
                    return Conflict(new { error = "Category with this name already exists" });
                }

                category.Name = request.Name;
            }

            if (request.Description != null)
            {
                category.Description = request.Description;
            }

            category.LastUpdateDate = DateTime.UtcNow;
            category.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new
            {
                category_id = category.CategoryId,
                id = category.CategoryId,
                name = category.Name,
                description = category.Description
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category");
            return StatusCode(500, new { error = "Failed to update category" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCategory(int id)
    {
        try
        {
            var category = await _context.TaskCategories
                .FirstOrDefaultAsync(c => c.CategoryId == id && c.RecordStatus == RecordStatus.Active);

            if (category == null)
            {
                return NotFound(new { error = "Category not found" });
            }

            // Soft delete
            category.RecordStatus = RecordStatus.Deleted;
            category.LastUpdateDate = DateTime.UtcNow;
            category.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new { message = "Category deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting category");
            return StatusCode(500, new { error = "Failed to delete category" });
        }
    }
}

public class CreateCategoryRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class UpdateCategoryRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
}