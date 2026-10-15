using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Data;
using CMT.Domain.Models;

namespace CMT.Web.Api.Controllers;

[ApiController]
[Route("api/reference-data/request-types")]
public class RequestTypesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<RequestTypesController> _logger;

    public RequestTypesController(ApplicationDbContext context, ILogger<RequestTypesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetRequestTypes()
    {
        try
        {
            var requestTypes = await _context.RequestTypes
                .Where(r => r.RecordStatus == RecordStatus.Active)
                .Select(r => new
                {
                    request_type_id = r.RequestTypeId,
                    id = r.RequestTypeId,
                    name = r.Name,
                    description = r.Description
                })
                .ToListAsync();

            return Ok(requestTypes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching request types");
            return StatusCode(500, new { error = "Failed to retrieve request types" });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateRequestType([FromBody] CreateRequestTypeRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { error = "Request type name is required" });
            }

            var exists = await _context.RequestTypes
                .AnyAsync(r => r.Name == request.Name && r.RecordStatus == RecordStatus.Active);

            if (exists)
            {
                return Conflict(new { error = "Request type with this name already exists" });
            }

            var requestType = new RequestType
            {
                Name = request.Name,
                Description = request.Description,
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

            _context.RequestTypes.Add(requestType);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                request_type_id = requestType.RequestTypeId,
                id = requestType.RequestTypeId,
                name = requestType.Name,
                description = requestType.Description
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating request type");
            return StatusCode(500, new { error = "Failed to create request type" });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateRequestType(int id, [FromBody] UpdateRequestTypeRequest request)
    {
        try
        {
            var requestType = await _context.RequestTypes
                .FirstOrDefaultAsync(r => r.RequestTypeId == id && r.RecordStatus == RecordStatus.Active);

            if (requestType == null)
            {
                return NotFound(new { error = "Request type not found" });
            }

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var exists = await _context.RequestTypes
                    .AnyAsync(r => r.Name == request.Name && r.RequestTypeId != id && r.RecordStatus == RecordStatus.Active);

                if (exists)
                {
                    return Conflict(new { error = "Request type with this name already exists" });
                }

                requestType.Name = request.Name;
            }

            if (request.Description != null)
            {
                requestType.Description = request.Description;
            }

            requestType.UpdatedAt = DateTime.UtcNow;
            requestType.LastUpdateDate = DateTime.UtcNow;
            requestType.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new
            {
                request_type_id = requestType.RequestTypeId,
                id = requestType.RequestTypeId,
                name = requestType.Name,
                description = requestType.Description
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating request type");
            return StatusCode(500, new { error = "Failed to update request type" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteRequestType(int id)
    {
        try
        {
            var requestType = await _context.RequestTypes
                .FirstOrDefaultAsync(r => r.RequestTypeId == id && r.RecordStatus == RecordStatus.Active);

            if (requestType == null)
            {
                return NotFound(new { error = "Request type not found" });
            }

            // Soft delete
            requestType.RecordStatus = RecordStatus.Deleted;
            requestType.UpdatedAt = DateTime.UtcNow;
            requestType.LastUpdateDate = DateTime.UtcNow;
            requestType.UpdatedBy = "System";

            await _context.SaveChangesAsync();

            return Ok(new { message = "Request type deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting request type");
            return StatusCode(500, new { error = "Failed to delete request type" });
        }
    }
}

public class CreateRequestTypeRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class UpdateRequestTypeRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
}