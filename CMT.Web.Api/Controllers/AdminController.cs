using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using CMT.Application.Services;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/admin")] // Changed from "api/users" to "api/admin" to avoid conflict
    [Authorize]
    public class AdminController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly ITaskService _taskService;
        private readonly IDepartmentService _departmentService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly ILogger<AdminController> _logger;

        public AdminController(
            IUserService userService,
            ITaskService taskService,
            IDepartmentService departmentService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            ILogger<AdminController> logger)
        {
            _userService = userService;
            _taskService = taskService;
            _departmentService = departmentService;
            _authorizationService = authorizationService;
            _logger = logger;
        }

        // REMOVED: GetAdminDashboard - This is now handled by UsersController_AdminEndpoints.cs
        // The endpoint /api/users/admin-dashboard/{id} is available in UsersController

        /// <summary>
        /// Create a new Director (Admin only) - Simple version
        /// FIXED: Now properly sets Department.DirectorId and CanCreateTeamLeader
        /// </summary>
        [HttpPost("create-director")]
        public async Task<IActionResult> CreateDirector([FromBody] CreateUserDto createUserDto)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                {
                    return Unauthorized(new { message = "Invalid user authentication" });
                }

                // Verify user has Admin role
                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning($"User {adminUserId} attempted to create Director without Admin role");
                    return Forbid();
                }

                // Validate that role is director
                if (createUserDto.Role != "director")
                {
                    return BadRequest(new { message = "Admin can only create Director users" });
                }

                // Validate department assignment
                bool creatingNewDepartment = !string.IsNullOrEmpty(createUserDto.NewDepartmentName);
                bool assigningExistingDepartment = createUserDto.DepartmentId.HasValue && createUserDto.DepartmentId.Value > 0;

                if (!creatingNewDepartment && !assigningExistingDepartment)
                {
                    return BadRequest(new { message = "Director must be assigned to a department. Either select an existing department or create a new one." });
                }

                _logger.LogInformation($"Admin {adminUserId} creating new Director: {createUserDto.Username} with CanCreateTeamLeader: {createUserDto.CanCreateTeamLeader}");

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                
                // CRITICAL FIX: Handle department assignment properly
                if (creatingNewDepartment)
                {
                    // Create director first without department
                    var tempCreateDto = new CreateUserDto
                    {
                        Username = createUserDto.Username,
                        Email = createUserDto.Email,
                        FullName = createUserDto.FullName,
                        Password = createUserDto.Password,
                        Role = "director",
                        IsActive = createUserDto.IsActive,
                        CanCreateTeamLeader = createUserDto.CanCreateTeamLeader // NEW: Pass Team Leader permission
                    };
                    
                    var newDirector = await _userService.CreateUserAsync(tempCreateDto, adminUserId, ipAddress);

                    // Create department with director as owner
                    var newDepartment = await _departmentService.CreateDepartmentAsync(
                        new CreateDepartmentDto
                        {
                            Name = createUserDto.NewDepartmentName!,
                            Description = createUserDto.NewDepartmentDescription
                        },
                        newDirector.UserId
                    );

                    // Update director's department assignment
                    await _userService.UpdateUserAsync(
                        newDirector.UserId,
                        new UpdateUserDto { DepartmentId = newDepartment.DepartmentId },
                        adminUserId,
                        ipAddress
                    );

                    _logger.LogInformation("Director {DirectorId} created with new department {DepartmentId}, CanCreateTeamLeader: {CanCreateTeamLeader}", 
                        newDirector.UserId, newDepartment.DepartmentId, createUserDto.CanCreateTeamLeader);

                    return CreatedAtAction(nameof(CreateDirector), new { id = newDirector.UserId }, await _userService.GetUserByIdAsync(newDirector.UserId));
                }
                else
                {
                    // Create director with existing department
                    var newDirector = await _userService.CreateUserAsync(createUserDto, adminUserId, ipAddress);

                    // CRITICAL FIX: Update Department.DirectorId
                    var context = HttpContext.RequestServices.GetRequiredService<CMT.Domain.Data.ApplicationDbContext>();
                    var department = await context.Departments.FindAsync(createUserDto.DepartmentId!.Value);
                    if (department != null)
                    {
                        department.DirectorId = newDirector.UserId;
                        department.UpdatedAt = DateTime.UtcNow;
                        await context.SaveChangesAsync();
                        
                        _logger.LogInformation("Director {DirectorId} assigned to department {DepartmentId}. Department.DirectorId updated, CanCreateTeamLeader: {CanCreateTeamLeader}", 
                            newDirector.UserId, department.DepartmentId, createUserDto.CanCreateTeamLeader);
                    }

                    return CreatedAtAction(nameof(CreateDirector), new { id = newDirector.UserId }, newDirector);
                }
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while creating Director");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating Director");
                return StatusCode(500, new { message = "Failed to create Director", error = ex.Message });
            }
        }

        /// <summary>
        /// Create a new Director with department assignment (Admin only)
        /// FIXED: Now properly sets Department.DirectorId and CanCreateTeamLeader
        /// </summary>
        [HttpPost("create-director-with-department")]
        public async Task<IActionResult> CreateDirectorWithDepartment([FromBody] CreateDirectorWithDepartmentDto createDirectorDto)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                {
                    return Unauthorized(new { message = "Invalid user authentication" });
                }

                // Verify user has Admin role
                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning($"User {adminUserId} attempted to create Director without Admin role");
                    return Forbid();
                }

                // Validate department assignment logic
                if (createDirectorDto.ExistingDepartmentId.HasValue && !string.IsNullOrWhiteSpace(createDirectorDto.NewDepartmentName))
                {
                    return BadRequest(new { message = "Cannot specify both existing department and new department name" });
                }

                if (!createDirectorDto.ExistingDepartmentId.HasValue && string.IsNullOrWhiteSpace(createDirectorDto.NewDepartmentName))
                {
                    return BadRequest(new { message = "Director must be assigned to a department. Either select an existing department or create a new one." });
                }

                _logger.LogInformation($"Admin {adminUserId} creating new Director with department: {createDirectorDto.Username}, CanCreateTeamLeader: {createDirectorDto.CanCreateTeamLeader}");

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                
                // CRITICAL FIX: Use the updated service method that properly sets Department.DirectorId
                var newDirector = await _userService.CreateDirectorWithDepartmentAsync(createDirectorDto, adminUserId, ipAddress);

                return CreatedAtAction(nameof(CreateDirectorWithDepartment), new { id = newDirector.UserId }, newDirector);
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while creating Director with department");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating Director with department");
                return StatusCode(500, new { message = "Failed to create Director with department", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all departments (Admin only)
        /// </summary>
        [HttpGet("departments")]
        public async Task<IActionResult> GetAllDepartments()
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId)) return Unauthorized();

                // Use fully qualified name to avoid CS0104 ambiguity
                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole) return Forbid();

                var departments = await _departmentService.GetAllDepartmentsAsync();
                return Ok(departments);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error", error = ex.Message });
            }
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SOFT-DELETE MANAGEMENT ENDPOINTS (Admin only)
        // ═══════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Get all soft-deleted users (Status == Inactive)
        /// GET /api/admin/soft-deleted-users
        /// </summary>
        [HttpGet("soft-deleted-users")]
        public async Task<IActionResult> GetSoftDeletedUsers()
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to access soft-deleted users without Admin role", adminUserId);
                    return Forbid();
                }

                var softDeletedUsers = await _userService.GetSoftDeletedUsersAsync();
                _logger.LogInformation("Admin {AdminId} retrieved {Count} soft-deleted users", adminUserId, softDeletedUsers.Count);
                return Ok(softDeletedUsers);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving soft-deleted users");
                return StatusCode(500, new { message = "Failed to retrieve soft-deleted users", error = ex.Message });
            }
        }

        /// <summary>
        /// Permanently delete a soft-deleted user (hard delete)
        /// DELETE /api/admin/users/{id}/permanent
        /// </summary>
        [HttpDelete("users/{id}/permanent")]
        public async Task<IActionResult> PermanentlyDeleteUser(int id)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to permanently delete user {TargetUserId} without Admin role", adminUserId, id);
                    return Forbid();
                }

                // Pass adminUserId so non-nullable FK references are reassigned to the admin
                var result = await _userService.PermanentlyDeleteUserAsync(id, adminUserId);
                if (!result)
                    return NotFound(new { message = $"User with ID {id} not found" });

                _logger.LogInformation("Admin {AdminId} permanently deleted user {UserId}", adminUserId, id);
                return Ok(new { message = $"User {id} has been permanently deleted" });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while permanently deleting user {UserId}", id);
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error permanently deleting user {UserId}", id);
                return StatusCode(500, new { message = "Failed to permanently delete user", error = ex.Message });
            }
        }

        /// <summary>
        /// Restore a soft-deleted user
        /// POST /api/admin/users/{id}/restore
        /// </summary>
        [HttpPost("users/{id}/restore")]
        public async Task<IActionResult> RestoreUser(int id)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to restore user {TargetUserId} without Admin role", adminUserId, id);
                    return Forbid();
                }

                var result = await _userService.RestoreUserAsync(id);
                if (!result)
                    return NotFound(new { message = $"User with ID {id} not found" });

                _logger.LogInformation("Admin {AdminId} restored user {UserId}", adminUserId, id);
                return Ok(new { message = $"User {id} has been restored to active status" });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while restoring user {UserId}", id);
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error restoring user {UserId}", id);
                return StatusCode(500, new { message = "Failed to restore user", error = ex.Message });
            }
        }

        /// <summary>
        /// Get all soft-deleted tasks (RecordStatus == Inactive)
        /// GET /api/admin/soft-deleted-tasks
        /// </summary>
        [HttpGet("soft-deleted-tasks")]
        public async Task<IActionResult> GetSoftDeletedTasks()
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to access soft-deleted tasks without Admin role", adminUserId);
                    return Forbid();
                }

                var softDeletedTasks = await _taskService.GetSoftDeletedTasksAsync();
                
                // Map to a simplified DTO for the response
                var taskDtos = softDeletedTasks.Select(t => new
                {
                    t.TaskId,
                    t.SerialNumber,
                    t.PartNumber,
                    t.PoNumber,
                    t.Description,
                    t.CategoryId,
                    CategoryName = t.Category?.Name,
                    Status = t.Status.ToString(),
                    t.AssignedEngineer,
                    t.PriorityId,
                    PriorityName = t.Priority?.LevelName,
                    t.EstimatedCompletionDate,
                    t.TargetCompletionDate,
                    t.ActualCompletionDate,
                    t.ShopId,
                    ShopName = t.Shop?.Name ?? t.Creator?.Shop?.Name,
                    t.CreatedBy,
                    CreatedByName = t.Creator?.FullName,
                    t.CreatedAt,
                    t.UpdatedAt,
                    RecordStatus = t.RecordStatus.ToString(),
                    CommentsCount = t.TaskComments?.Count ?? 0,
                    AttachmentsCount = t.Attachments?.Count ?? 0
                });

                _logger.LogInformation("Admin {AdminId} retrieved {Count} soft-deleted tasks", adminUserId, softDeletedTasks.Count());
                return Ok(taskDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving soft-deleted tasks");
                return StatusCode(500, new { message = "Failed to retrieve soft-deleted tasks", error = ex.Message });
            }
        }

        /// <summary>
        /// Permanently delete a soft-deleted task and all related records (hard delete)
        /// DELETE /api/admin/tasks/{id}/permanent
        /// </summary>
        [HttpDelete("tasks/{id}/permanent")]
        public async Task<IActionResult> PermanentlyDeleteTask(int id)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to permanently delete task {TaskId} without Admin role", adminUserId, id);
                    return Forbid();
                }

                var result = await _taskService.PermanentlyDeleteTaskAsync(id);
                if (!result)
                    return NotFound(new { message = $"Task with ID {id} not found" });

                _logger.LogInformation("Admin {AdminId} permanently deleted task {TaskId} and all related records", adminUserId, id);
                return Ok(new { message = $"Task TC-{id} and all related records have been permanently deleted" });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while permanently deleting task {TaskId}", id);
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error permanently deleting task {TaskId}", id);
                return StatusCode(500, new { message = "Failed to permanently delete task", error = ex.Message });
            }
        }

        /// <summary>
        /// Restore a soft-deleted task
        /// POST /api/admin/tasks/{id}/restore
        /// </summary>
        [HttpPost("tasks/{id}/restore")]
        public async Task<IActionResult> RestoreTask(int id)
        {
            try
            {
                var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (!int.TryParse(userIdClaim, out var adminUserId))
                    return Unauthorized(new { message = "Invalid user authentication" });

                var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
                if (!hasAdminRole)
                {
                    _logger.LogWarning("User {UserId} attempted to restore task {TaskId} without Admin role", adminUserId, id);
                    return Forbid();
                }

                var result = await _taskService.RestoreTaskAsync(id);
                if (!result)
                    return NotFound(new { message = $"Task with ID {id} not found" });

                _logger.LogInformation("Admin {AdminId} restored task {TaskId}", adminUserId, id);
                return Ok(new { message = $"Task TC-{id} has been restored to active status" });
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogWarning(ex, "Invalid operation while restoring task {TaskId}", id);
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error restoring task {TaskId}", id);
                return StatusCode(500, new { message = "Failed to restore task", error = ex.Message });
            }
        }
    }
}