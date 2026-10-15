using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Data;
using CMT.Domain.Models;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class TransfersController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<TransfersController> _logger;

        public TransfersController(ApplicationDbContext context, ILogger<TransfersController> logger)
        {
            _context = context;
            _logger = logger;
        }

        private (int UserId, string UserName, string UserRole) GetCurrentUser()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                _logger.LogWarning("GetCurrentUser: No valid user ID found in claims. UserIdClaim={UserIdClaim}", userIdClaim);
                return (1, "System", "customer");
            }

            _logger.LogInformation("GetCurrentUser: UserId={UserId}, UserName={UserName}, UserRole={UserRole}", 
                userId, userName ?? "Unknown", userRole ?? "customer");

            return (userId, userName ?? "Unknown", userRole ?? "customer");
        }

        /// <summary>
        /// FIXED: Enhanced role checking with flexible matching
        /// </summary>
        private bool IsRoleAuthorized(string userRole, string[] allowedRoles)
        {
            if (string.IsNullOrWhiteSpace(userRole))
            {
                return false;
            }

            // Normalize the user's role
            var normalizedUserRole = userRole.ToLower().Trim()
                .Replace(" ", "_")
                .Replace("-", "_")
                .Replace("__", "_");

            // Check against all allowed roles with normalization
            foreach (var allowedRole in allowedRoles)
            {
                var normalizedAllowedRole = allowedRole.ToLower().Trim()
                    .Replace(" ", "_")
                    .Replace("-", "_")
                    .Replace("__", "_");

                if (normalizedUserRole == normalizedAllowedRole)
                {
                    return true;
                }

                // Also check partial matches for common variations
                if (normalizedUserRole.Contains(normalizedAllowedRole) || 
                    normalizedAllowedRole.Contains(normalizedUserRole))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Get all transfers with role-based filtering
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetTransfers()
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                _logger.LogInformation("GetTransfers called by user {UserId} ({UserName}) with role {UserRole}", 
                    userId, userName, userRole);

                var query = _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .Include(t => t.Creator)
                    .AsQueryable();

                // Apply role-based filtering
                var normalizedRole = userRole.ToLower().Replace(" ", "_").Replace("-", "_");

                if (normalizedRole == "engineer")
                {
                    // Engineers see transfers assigned to them
                    query = query.Where(t => 
                        t.AssignedEngineerId == userId || 
                        (t.AssignedEngineer != null && t.AssignedEngineer.Contains(userName)));
                }
                else if (normalizedRole == "customer" || normalizedRole == "customer_personnel")
                {
                    // Customers see transfers they created
                    query = query.Where(t => t.CreatedBy == userId);
                }
                else if (normalizedRole == "shop_tl")
                {
                    // Shop TL sees transfers from/to their shop
                    var currentUser = await _context.Users.FindAsync(userId);
                    if (currentUser?.ShopId != null)
                    {
                        var shopId = currentUser.ShopId.Value;
                        query = query.Where(t => t.FromShopId == shopId || t.ToShopId == shopId);
                    }
                }
                // team_leader and director see all transfers (no filtering)

                var transfers = await query
                    .OrderByDescending(t => t.CreatedAt)
                    .Select(t => new
                    {
                        transfer_id = t.TransferId,
                        id = t.TransferId,
                        from_shop = t.FromShop,
                        to_shop = t.ToShop,
                        from_shop_id = t.FromShopId,
                        to_shop_id = t.ToShopId,
                        from_shop_name = t.FromShopNavigation != null ? t.FromShopNavigation.Name : t.FromShop,
                        to_shop_name = t.ToShopNavigation != null ? t.ToShopNavigation.Name : t.ToShop,
                        part_number = t.PartNumber,
                        serial_number = t.SerialNumber,
                        status = t.Status,
                        notes = t.Notes,
                        created_at = t.CreatedAt,
                        created_by = t.CreatedBy,
                        creator_name = t.Creator != null ? t.Creator.FullName : null,
                        assigned_engineer = t.AssignedEngineer,
                        assigned_engineer_id = t.AssignedEngineerId
                    })
                    .ToListAsync();

                _logger.LogInformation("Returning {Count} transfers for user {UserId}", transfers.Count, userId);

                return Ok(new { transfers });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transfers");
                return StatusCode(500, new { error = "An error occurred while retrieving transfers", detail = ex.Message });
            }
        }

        /// <summary>
        /// Get a specific transfer by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetTransfer(int id)
        {
            try
            {
                var transfer = await _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TransferId == id);

                if (transfer == null)
                {
                    return NotFound(new { error = $"Transfer with ID {id} not found" });
                }

                var result = new
                {
                    transfer_id = transfer.TransferId,
                    id = transfer.TransferId,
                    from_shop = transfer.FromShop,
                    to_shop = transfer.ToShop,
                    from_shop_id = transfer.FromShopId,
                    to_shop_id = transfer.ToShopId,
                    from_shop_name = transfer.FromShopNavigation?.Name ?? transfer.FromShop,
                    to_shop_name = transfer.ToShopNavigation?.Name ?? transfer.ToShop,
                    part_number = transfer.PartNumber,
                    serial_number = transfer.SerialNumber,
                    status = transfer.Status,
                    notes = transfer.Notes,
                    created_at = transfer.CreatedAt,
                    created_by = transfer.CreatedBy,
                    creator_name = transfer.Creator?.FullName,
                    assigned_engineer = transfer.AssignedEngineer,
                    assigned_engineer_id = transfer.AssignedEngineerId
                };

                return Ok(new { transfer = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transfer {TransferId}", id);
                return StatusCode(500, new { error = "An error occurred while retrieving the transfer", detail = ex.Message });
            }
        }

        /// <summary>
        /// Get current user's shop information
        /// </summary>
        [HttpGet("current-user-shop")]
        public async Task<ActionResult<object>> GetCurrentUserShop()
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                var currentUser = await _context.Users
                    .Include(u => u.Shop)
                    .FirstOrDefaultAsync(u => u.UserId == userId);

                if (currentUser == null)
                {
                    return NotFound(new { error = "User not found" });
                }

                return Ok(new
                {
                    user_id = userId,
                    user_name = userName,
                    user_role = userRole,
                    shop_id = currentUser.ShopId,
                    shop_name = currentUser.Shop?.Name,
                    has_assigned_shop = currentUser.ShopId.HasValue
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving current user shop");
                return StatusCode(500, new { error = "An error occurred while retrieving user shop information", detail = ex.Message });
            }
        }

        /// <summary>
        /// CRITICAL FIX: Create a new transfer with enhanced permission checking
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<object>> CreateTransfer([FromBody] CreateTransferRequest request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                _logger.LogInformation("CreateTransfer: User {UserId} ({UserName}) with role '{UserRole}' attempting to create transfer", 
                    userId, userName, userRole);
                
                // CRITICAL FIX: Enhanced permission check with flexible role matching
                var allowedRoles = new[] { "team_leader", "director", "customer_personnel", "shop_tl", "manager", "teamleader", "shoptl", "customerpersonnel" };
                
                if (!IsRoleAuthorized(userRole, allowedRoles))
                {
                    _logger.LogWarning("CreateTransfer: User {UserId} with role '{UserRole}' is NOT authorized. Allowed roles: {AllowedRoles}", 
                        userId, userRole, string.Join(", ", allowedRoles));
                    return StatusCode(403, new { 
                        error = "You do not have permission to create transfers",
                        message = $"Your role '{userRole}' is not authorized. Please contact your administrator.",
                        userRole = userRole,
                        userId = userId
                    });
                }

                _logger.LogInformation("CreateTransfer: User {UserId} role '{UserRole}' is AUTHORIZED", userId, userRole);

                // Get current user's shop assignment
                var currentUser = await _context.Users.FindAsync(userId);
                int? userShopId = currentUser?.ShopId;

                _logger.LogInformation("CreateTransfer: User {UserId} has shop assignment: {ShopId}", userId, userShopId);

                // Normalize role for logic checks
                var normalizedRole = userRole.ToLower().Replace(" ", "_").Replace("-", "_");

                // CRITICAL FIX: For shop_tl and customer_personnel, ALWAYS use their assigned shop as from_shop_id
                if (normalizedRole.Contains("shop") && normalizedRole.Contains("tl") || 
                    normalizedRole.Contains("customer") && normalizedRole.Contains("personnel"))
                {
                    if (!userShopId.HasValue)
                    {
                        _logger.LogError("CreateTransfer: User {UserId} ({Role}) has no assigned shop", userId, userRole);
                        return BadRequest(new { 
                            error = "Cannot create transfer: Your account has no assigned shop. Please contact your administrator.",
                            detail = $"User {userId} ({userName}) with role {userRole} has no ShopId assigned."
                        });
                    }

                    // ALWAYS use user's assigned shop as source shop for these roles
                    request.from_shop_id = userShopId.Value;
                    _logger.LogInformation("CreateTransfer: Auto-assigned from_shop_id={ShopId} for {Role} user {UserId}", 
                        userShopId.Value, userRole, userId);
                }
                else if (normalizedRole.Contains("team") && normalizedRole.Contains("leader") || 
                         normalizedRole.Contains("director") || 
                         normalizedRole.Contains("manager"))
                {
                    // Team leaders, directors, and managers can transfer from any shop
                    if (!request.from_shop_id.HasValue && userShopId.HasValue)
                    {
                        request.from_shop_id = userShopId.Value;
                        _logger.LogInformation("CreateTransfer: Auto-populated from_shop_id={ShopId} for {Role} user {UserId}", 
                            userShopId.Value, userRole, userId);
                    }
                }

                // Validate to_shop_id is provided
                if (!request.to_shop_id.HasValue)
                {
                    _logger.LogWarning("CreateTransfer: Missing to_shop_id in request");
                    return BadRequest(new { error = "Destination shop (to_shop_id) is required" });
                }

                // Validate from_shop_id is now available
                if (!request.from_shop_id.HasValue)
                {
                    _logger.LogWarning("CreateTransfer: Missing from_shop_id in request");
                    return BadRequest(new { 
                        error = "Source shop (from_shop_id) is required",
                        detail = "Please specify the source shop for this transfer"
                    });
                }

                if (request.from_shop_id == request.to_shop_id)
                {
                    _logger.LogWarning("CreateTransfer: from_shop_id and to_shop_id are the same: {ShopId}", request.from_shop_id);
                    return BadRequest(new { error = "Source and destination shops cannot be the same" });
                }

                // Validate shops exist
                var fromShop = await _context.Shops.FindAsync(request.from_shop_id.Value);
                var toShop = await _context.Shops.FindAsync(request.to_shop_id.Value);

                if (fromShop == null)
                {
                    _logger.LogWarning("CreateTransfer: Source shop {ShopId} not found", request.from_shop_id);
                    return BadRequest(new { error = $"Source shop with ID {request.from_shop_id} not found" });
                }

                if (toShop == null)
                {
                    _logger.LogWarning("CreateTransfer: Destination shop {ShopId} not found", request.to_shop_id);
                    return BadRequest(new { error = $"Destination shop with ID {request.to_shop_id} not found" });
                }

                // Validate task exists if task_id is provided
                CMT.Domain.Models.Task? task = null;
                if (request.task_id.HasValue)
                {
                    task = await _context.Tasks.FindAsync(request.task_id.Value);
                    if (task == null)
                    {
                        _logger.LogWarning("CreateTransfer: Task {TaskId} not found", request.task_id);
                        return BadRequest(new { error = $"Task with ID {request.task_id} not found" });
                    }

                    // CRITICAL FIX: If task has no shop, automatically assign it to from_shop
                    if (!task.ShopId.HasValue)
                    {
                        task.ShopId = request.from_shop_id;
                        task.UpdatedAt = DateTime.UtcNow;
                        _logger.LogInformation("CreateTransfer: Auto-assigned task {TaskId} to source shop {ShopId} during transfer creation", 
                            task.TaskId, request.from_shop_id);
                    }
                }

                // Validate part_number or serial_number
                if (string.IsNullOrWhiteSpace(request.serial_number) && string.IsNullOrWhiteSpace(request.part_number))
                {
                    // If task is provided, use its part/serial numbers
                    if (task != null && (string.IsNullOrWhiteSpace(task.PartNumber) && string.IsNullOrWhiteSpace(task.SerialNumber)))
                    {
                        return BadRequest(new { error = "Either serial number or part number is required for the transfer" });
                    }
                    else if (task == null)
                    {
                        return BadRequest(new { error = "Either serial number or part number is required" });
                    }
                }

                var transfer = new Transfer
                {
                    FromShop = fromShop.Name,
                    ToShop = toShop.Name,
                    FromShopId = request.from_shop_id,
                    ToShopId = request.to_shop_id,
                    PartNumber = request.part_number ?? task?.PartNumber,
                    SerialNumber = request.serial_number ?? task?.SerialNumber,
                    Notes = request.notes,
                    Status = "pending",
                    CreatedBy = userId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.Set<Transfer>().Add(transfer);
                await _context.SaveChangesAsync();

                // If task is provided, update task's shop assignment to destination shop
                if (task != null)
                {
                    task.ShopId = request.to_shop_id;
                    task.UpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("CreateTransfer: Updated task {TaskId} shop assignment from {FromShopId} to {ToShopId}", 
                        task.TaskId, request.from_shop_id, request.to_shop_id);
                }

                // Reload with navigation properties
                var createdTransfer = await _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TransferId == transfer.TransferId);

                var result = new
                {
                    transfer_id = createdTransfer!.TransferId,
                    id = createdTransfer.TransferId,
                    task_id = request.task_id,
                    from_shop = createdTransfer.FromShop,
                    to_shop = createdTransfer.ToShop,
                    from_shop_id = createdTransfer.FromShopId,
                    to_shop_id = createdTransfer.ToShopId,
                    from_shop_name = createdTransfer.FromShopNavigation?.Name ?? createdTransfer.FromShop,
                    to_shop_name = createdTransfer.ToShopNavigation?.Name ?? createdTransfer.ToShop,
                    part_number = createdTransfer.PartNumber,
                    serial_number = createdTransfer.SerialNumber,
                    status = createdTransfer.Status,
                    notes = createdTransfer.Notes,
                    created_at = createdTransfer.CreatedAt,
                    created_by = createdTransfer.CreatedBy,
                    creator_name = createdTransfer.Creator?.FullName,
                    assigned_engineer = createdTransfer.AssignedEngineer,
                    assigned_engineer_id = createdTransfer.AssignedEngineerId
                };

                _logger.LogInformation("CreateTransfer: Transfer {TransferId} created successfully by user {UserId} from shop {FromShopId} to shop {ToShopId}", 
                    transfer.TransferId, userId, request.from_shop_id, request.to_shop_id);

                return CreatedAtAction(nameof(GetTransfer), new { id = transfer.TransferId }, new { transfer = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CreateTransfer: Error creating transfer");
                return StatusCode(500, new { error = "An error occurred while creating the transfer", detail = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Accept a transfer - updates status and completes the transfer
        /// </summary>
        [HttpPost("{id}/accept")]
        public async Task<ActionResult<object>> AcceptTransfer(int id)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                var transfer = await _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .FirstOrDefaultAsync(t => t.TransferId == id);

                if (transfer == null)
                {
                    return NotFound(new { error = $"Transfer with ID {id} not found" });
                }

                if (transfer.Status != "pending")
                {
                    return BadRequest(new { error = $"Transfer is already {transfer.Status}" });
                }

                transfer.Status = "accepted";
                transfer.AssignedEngineer = userName;
                transfer.AssignedEngineerId = userId;
                
                await _context.SaveChangesAsync();

                var result = new
                {
                    transfer_id = transfer.TransferId,
                    status = transfer.Status,
                    action_by = userName,
                    action_at = DateTime.UtcNow
                };

                _logger.LogInformation("Transfer {TransferId} accepted by user {UserId}", id, userId);

                return Ok(new { transfer = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error accepting transfer {TransferId}", id);
                return StatusCode(500, new { error = "An error occurred while accepting the transfer", detail = ex.Message });
            }
        }

        /// <summary>
        /// Reject a transfer - updates status
        /// </summary>
        [HttpPost("{id}/reject")]
        public async Task<ActionResult<object>> RejectTransfer(int id, [FromBody] RejectTransferRequest? request = null)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                var transfer = await _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .FirstOrDefaultAsync(t => t.TransferId == id);

                if (transfer == null)
                {
                    return NotFound(new { error = $"Transfer with ID {id} not found" });
                }

                if (transfer.Status != "pending")
                {
                    return BadRequest(new { error = $"Transfer is already {transfer.Status}" });
                }

                transfer.Status = "rejected";
                transfer.AssignedEngineer = userName;
                transfer.AssignedEngineerId = userId;
                
                if (!string.IsNullOrWhiteSpace(request?.reason))
                {
                    transfer.Notes = (transfer.Notes ?? "") + "\nRejection reason: " + request.reason;
                }
                
                await _context.SaveChangesAsync();

                var result = new
                {
                    transfer_id = transfer.TransferId,
                    status = transfer.Status,
                    action_by = userName,
                    action_at = DateTime.UtcNow
                };

                _logger.LogInformation("Transfer {TransferId} rejected by user {UserId}", id, userId);

                return Ok(new { transfer = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rejecting transfer {TransferId}", id);
                return StatusCode(500, new { error = "An error occurred while rejecting the transfer", detail = ex.Message });
            }
        }

        /// <summary>
        /// Update a transfer
        /// </summary>
        [HttpPut("{id}")]
        public async Task<ActionResult<object>> UpdateTransfer(int id, [FromBody] UpdateTransferRequest request)
        {
            try
            {
                var transfer = await _context.Set<Transfer>().FindAsync(id);
                if (transfer == null)
                {
                    return NotFound(new { error = $"Transfer with ID {id} not found" });
                }

                transfer.FromShop = request.from_shop ?? transfer.FromShop;
                transfer.ToShop = request.to_shop ?? transfer.ToShop;
                transfer.FromShopId = request.from_shop_id ?? transfer.FromShopId;
                transfer.ToShopId = request.to_shop_id ?? transfer.ToShopId;
                transfer.PartNumber = request.part_number ?? transfer.PartNumber;
                transfer.SerialNumber = request.serial_number ?? transfer.SerialNumber;
                transfer.Status = request.status ?? transfer.Status;
                transfer.Notes = request.notes ?? transfer.Notes;
                transfer.AssignedEngineer = request.assigned_engineer ?? transfer.AssignedEngineer;
                transfer.AssignedEngineerId = request.assigned_engineer_id ?? transfer.AssignedEngineerId;

                await _context.SaveChangesAsync();

                // Reload with navigation properties
                var updatedTransfer = await _context.Set<Transfer>()
                    .Include(t => t.FromShopNavigation)
                    .Include(t => t.ToShopNavigation)
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TransferId == id);

                var result = new
                {
                    transfer_id = updatedTransfer!.TransferId,
                    id = updatedTransfer.TransferId,
                    from_shop = updatedTransfer.FromShop,
                    to_shop = updatedTransfer.ToShop,
                    from_shop_id = updatedTransfer.FromShopId,
                    to_shop_id = updatedTransfer.ToShopId,
                    from_shop_name = updatedTransfer.FromShopNavigation?.Name ?? updatedTransfer.FromShop,
                    to_shop_name = updatedTransfer.ToShopNavigation?.Name ?? updatedTransfer.ToShop,
                    part_number = updatedTransfer.PartNumber,
                    serial_number = updatedTransfer.SerialNumber,
                    status = updatedTransfer.Status,
                    notes = updatedTransfer.Notes,
                    created_at = updatedTransfer.CreatedAt,
                    created_by = updatedTransfer.CreatedBy,
                    creator_name = updatedTransfer.Creator?.FullName,
                    assigned_engineer = updatedTransfer.AssignedEngineer,
                    assigned_engineer_id = updatedTransfer.AssignedEngineerId
                };

                return Ok(new { transfer = result });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating transfer {TransferId}", id);
                return StatusCode(500, new { error = "An error occurred while updating the transfer", detail = ex.Message });
            }
        }

        /// <summary>
        /// Delete a transfer
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteTransfer(int id)
        {
            try
            {
                var transfer = await _context.Set<Transfer>().FindAsync(id);
                if (transfer == null)
                {
                    return NotFound(new { error = $"Transfer with ID {id} not found" });
                }

                _context.Set<Transfer>().Remove(transfer);
                await _context.SaveChangesAsync();

                return Ok(new { message = $"Transfer {id} deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting transfer {TransferId}", id);
                return StatusCode(500, new { error = "An error occurred while deleting the transfer", detail = ex.Message });
            }
        }
    }

    public class CreateTransferRequest
    {
        public int? task_id { get; set; }
        public string? from_shop { get; set; }
        public string? to_shop { get; set; }
        public int? from_shop_id { get; set; }
        public int? to_shop_id { get; set; }
        public string? part_number { get; set; }
        public string? serial_number { get; set; }
        public string? notes { get; set; }
        public int? created_by { get; set; }
    }

    public class UpdateTransferRequest
    {
        public string? from_shop { get; set; }
        public string? to_shop { get; set; }
        public int? from_shop_id { get; set; }
        public int? to_shop_id { get; set; }
        public string? part_number { get; set; }
        public string? serial_number { get; set; }
        public string? status { get; set; }
        public string? notes { get; set; }
        public string? assigned_engineer { get; set; }
        public int? assigned_engineer_id { get; set; }
    }

    public class RejectTransferRequest
    {
        public string? reason { get; set; }
    }
}