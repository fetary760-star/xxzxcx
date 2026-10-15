using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.Interfaces;
using CMT.Application.DTOs;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using DomainUserRole = CMT.Domain.Models.UserRole;

namespace CMT.Web.Api.Controllers
{
    /// <summary>
    /// Admin-only endpoints for managing Directors
    /// Provides full CRUD operations for directors including manager assignment
    /// FIX: Changed from [Authorize(Roles = "...")] to manual HasRoleAsync() authorization
    /// to fix 403 errors caused by JWT role claim mapping issues in ASP.NET Core
    /// FIX 2: Auto-create default department when director has none (fixes "No managers assigned" issue)
    /// FIX 3: GetDirectorManagers also checks SupervisorId fallback
    /// </summary>
    [ApiController]
    [Route("api/admin/directors")]
    [Authorize]
    public class AdminDirectorController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IUserService _userService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly ILogger<AdminDirectorController> _logger;

        public AdminDirectorController(
            ApplicationDbContext context,
            IUserService userService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            ILogger<AdminDirectorController> logger)
        {
            _context = context;
            _userService = userService;
            _authorizationService = authorizationService;
            _logger = logger;
        }

        /// <summary>
        /// Verify that the current user has Admin role
        /// Uses HasRoleAsync which properly checks the role from the database
        /// </summary>
        private async Task<(bool isAdmin, int userId)> VerifyAdminAccess()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdClaim, out var adminUserId))
            {
                return (false, 0);
            }

            var hasAdminRole = await _authorizationService.HasRoleAsync(adminUserId, CMT.Application.DTOs.UserRole.Admin);
            return (hasAdminRole, adminUserId);
        }

        /// <summary>
        /// Helper: Ensure a director has at least one active department.
        /// If not, auto-create a default department for them.
        /// Returns the department (existing or newly created).
        /// </summary>
        private async Task<Department> EnsureDirectorHasDepartment(User director)
        {
            var department = await _context.Departments
                .FirstOrDefaultAsync(d => d.DirectorId == director.UserId && d.IsActive);

            if (department != null)
            {
                return department;
            }

            // Auto-create a default department for this director
            _logger.LogInformation(
                "Director {DirectorId} ({DirectorName}) has no active departments. Auto-creating a default department.",
                director.UserId, director.FullName);

            department = new Department
            {
                Name = $"{director.FullName}'s Department",
                Description = $"Default department for director {director.FullName}",
                DirectorId = director.UserId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Departments.Add(department);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Auto-created department {DepartmentId} ('{DepartmentName}') for director {DirectorId}",
                department.DepartmentId, department.Name, director.UserId);

            return department;
        }

        /// <summary>
        /// GET /api/admin/directors
        /// Get all directors in the system
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<List<UserDto>>> GetAllDirectors()
        {
            try
            {
                _logger.LogInformation("Admin fetching all directors");

                // Manual admin role check (fixes 403 from [Authorize(Roles)] attribute)
                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to access directors without Admin role", adminUserId);
                    return Forbid();
                }

                var directors = await _context.Users
                    .Include(u => u.Department)
                    .Include(u => u.CreatedDepartments)
                    .Where(u => u.Role == DomainUserRole.Director && u.Status == UserStatus.Active)
                    .OrderBy(u => u.FullName)
                    .ToListAsync();

                var directorDtos = new List<UserDto>();
                foreach (var director in directors)
                {
                    // Get managers assigned to this director via departments
                    var departmentIds = await _context.Departments
                        .Where(d => d.DirectorId == director.UserId && d.IsActive)
                        .Select(d => d.DepartmentId)
                        .ToListAsync();

                    var managersCountViaDept = 0;
                    if (departmentIds.Any())
                    {
                        managersCountViaDept = await _context.Users
                            .Where(u => u.Role == DomainUserRole.Manager &&
                                       u.DepartmentId.HasValue &&
                                       departmentIds.Contains(u.DepartmentId.Value) &&
                                       u.Status == UserStatus.Active)
                            .CountAsync();
                    }

                    // FIX: Also count managers linked via SupervisorId (fallback relationship)
                    var managersCountViaSupervisor = await _context.Users
                        .Where(u => u.Role == DomainUserRole.Manager &&
                                   u.SupervisorId == director.UserId &&
                                   u.Status == UserStatus.Active &&
                                   (!u.DepartmentId.HasValue || !departmentIds.Contains(u.DepartmentId.Value)))
                        .CountAsync();

                    var totalManagersCount = managersCountViaDept + managersCountViaSupervisor;

                    directorDtos.Add(new UserDto
                    {
                        UserId = director.UserId,
                        FullName = director.FullName,
                        Username = director.Username,
                        Email = director.Email,
                        Role = "director",
                        DepartmentId = director.DepartmentId,
                        DepartmentName = director.Department?.Name,
                        IsActive = director.Status == UserStatus.Active,
                        CanCreateTeamLeader = director.CanCreateTeamLeader,
                        CreatedAt = director.CreatedAt,
                        ActiveTasksCount = totalManagersCount // Reusing this field to show manager count
                    });
                }

                _logger.LogInformation("Found {Count} directors", directorDtos.Count);
                return Ok(directorDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching all directors");
                return StatusCode(500, new { message = "An error occurred while fetching directors", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/admin/directors/{directorId}
        /// Get a specific director's details
        /// </summary>
        [HttpGet("{directorId}")]
        public async Task<ActionResult<UserDto>> GetDirector(int directorId)
        {
            try
            {
                _logger.LogInformation("Admin fetching director {DirectorId}", directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to access director {DirectorId} without Admin role", adminUserId, directorId);
                    return Forbid();
                }

                var director = await _context.Users
                    .Include(u => u.Department)
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                var directorDto = new UserDto
                {
                    UserId = director.UserId,
                    FullName = director.FullName,
                    Username = director.Username,
                    Email = director.Email,
                    Role = "director",
                    DepartmentId = director.DepartmentId,
                    DepartmentName = director.Department?.Name,
                    IsActive = director.Status == UserStatus.Active,
                    CanCreateTeamLeader = director.CanCreateTeamLeader,
                    CreatedAt = director.CreatedAt
                };

                return Ok(directorDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching director {DirectorId}", directorId);
                return StatusCode(500, new { message = "An error occurred while fetching director", error = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/admin/directors/{directorId}
        /// Update a director's information
        /// </summary>
        [HttpPut("{directorId}")]
        public async Task<ActionResult> UpdateDirector(int directorId, [FromBody] UpdateDirectorDto dto)
        {
            try
            {
                _logger.LogInformation("Admin updating director {DirectorId}", directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to update director {DirectorId} without Admin role", adminUserId, directorId);
                    return Forbid();
                }

                var director = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                // Update basic information
                if (!string.IsNullOrWhiteSpace(dto.FullName))
                    director.FullName = dto.FullName.Trim();

                if (!string.IsNullOrWhiteSpace(dto.Username))
                    director.Username = dto.Username.Trim();

                if (!string.IsNullOrWhiteSpace(dto.Email))
                    director.Email = dto.Email.Trim();

                // Update password if provided
                if (!string.IsNullOrWhiteSpace(dto.NewPassword))
                {
                    director.Password = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
                }

                // Update status
                director.Status = dto.IsActive ? UserStatus.Active : UserStatus.Inactive;

                // Update permission
                director.CanCreateTeamLeader = dto.CanCreateTeamLeader;

                // Update department assignment if provided
                if (dto.DepartmentId.HasValue)
                {
                    var department = await _context.Departments
                        .FirstOrDefaultAsync(d => d.DepartmentId == dto.DepartmentId.Value);

                    if (department != null)
                    {
                        director.DepartmentId = dto.DepartmentId.Value;
                    }
                }

                director.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Director {DirectorId} updated successfully", directorId);
                return Ok(new { message = "Director updated successfully", userId = directorId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating director {DirectorId}", directorId);
                return StatusCode(500, new { message = "An error occurred while updating director", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/admin/directors/{directorId}/managers
        /// Get all managers assigned to a specific director
        /// FIX: Also finds managers linked via SupervisorId (not just DepartmentId)
        /// </summary>
        [HttpGet("{directorId}/managers")]
        public async Task<ActionResult<List<UserDto>>> GetDirectorManagers(int directorId)
        {
            try
            {
                _logger.LogInformation("Admin fetching managers for director {DirectorId}", directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to access director {DirectorId} managers without Admin role", adminUserId, directorId);
                    return Forbid();
                }

                // Verify director exists
                var director = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                // Get all departments owned by this director
                var departmentIds = await _context.Departments
                    .Where(d => d.DirectorId == directorId && d.IsActive)
                    .Select(d => d.DepartmentId)
                    .ToListAsync();

                // FIX: Get managers via departments OR via SupervisorId relationship
                var managers = await _context.Users
                    .Include(u => u.Department)
                    .Where(u => u.Role == DomainUserRole.Manager &&
                               u.Status == UserStatus.Active &&
                               (
                                   // Method 1: Manager is in a department owned by this director
                                   (u.DepartmentId.HasValue && departmentIds.Contains(u.DepartmentId.Value)) ||
                                   // Method 2: Manager has SupervisorId pointing to this director
                                   (u.SupervisorId == directorId)
                               ))
                    .OrderBy(u => u.FullName)
                    .Distinct()
                    .ToListAsync();

                var managerDtos = managers.Select(m => new UserDto
                {
                    UserId = m.UserId,
                    FullName = m.FullName,
                    Username = m.Username,
                    Email = m.Email,
                    Role = "manager",
                    DepartmentId = m.DepartmentId,
                    DepartmentName = m.Department?.Name,
                    IsActive = m.Status == UserStatus.Active,
                    CreatedAt = m.CreatedAt
                }).ToList();

                _logger.LogInformation("Found {Count} managers for director {DirectorId}", managerDtos.Count, directorId);
                return Ok(managerDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching managers for director {DirectorId}", directorId);
                return StatusCode(500, new { message = "An error occurred while fetching managers", error = ex.Message });
            }
        }

        /// <summary>
        /// POST /api/admin/directors/{directorId}/managers
        /// Assign a manager to a director (by adding them to a director's department)
        /// FIX: Auto-creates a default department if the director has none
        /// </summary>
        [HttpPost("{directorId}/managers")]
        public async Task<ActionResult> AssignManagerToDirector(int directorId, [FromBody] AssignManagerDto dto)
        {
            try
            {
                _logger.LogInformation("Admin assigning manager {ManagerId} to director {DirectorId}", dto.ManagerId, directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to assign manager without Admin role", adminUserId);
                    return Forbid();
                }

                // Verify director exists
                var director = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                // Verify manager exists
                var manager = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == dto.ManagerId && u.Role == DomainUserRole.Manager);

                if (manager == null)
                {
                    return NotFound(new { message = "Manager not found" });
                }

                // FIX: Auto-create department if director has none (instead of returning 400)
                var department = await EnsureDirectorHasDepartment(director);

                // Assign manager to the department
                manager.DepartmentId = department.DepartmentId;
                // Also set SupervisorId for a direct relationship fallback
                manager.SupervisorId = directorId;
                manager.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Manager {ManagerId} assigned to director {DirectorId} via department {DepartmentId}",
                    dto.ManagerId, directorId, department.DepartmentId);

                return Ok(new {
                    message = "Manager assigned successfully",
                    managerId = dto.ManagerId,
                    directorId = directorId,
                    departmentId = department.DepartmentId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error assigning manager {ManagerId} to director {DirectorId}", dto.ManagerId, directorId);
                return StatusCode(500, new { message = "An error occurred while assigning manager", error = ex.Message });
            }
        }

        /// <summary>
        /// DELETE /api/admin/directors/{directorId}/managers/{managerId}
        /// Remove a manager from a director (unassign from department)
        /// </summary>
        [HttpDelete("{directorId}/managers/{managerId}")]
        public async Task<ActionResult> RemoveManagerFromDirector(int directorId, int managerId)
        {
            try
            {
                _logger.LogInformation("Admin removing manager {ManagerId} from director {DirectorId}", managerId, directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to remove manager without Admin role", adminUserId);
                    return Forbid();
                }

                // Verify director exists
                var director = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                // Verify manager exists
                var manager = await _context.Users
                    .Include(u => u.Department)
                    .FirstOrDefaultAsync(u => u.UserId == managerId && u.Role == DomainUserRole.Manager);

                if (manager == null)
                {
                    return NotFound(new { message = "Manager not found" });
                }

                // FIX: Verify manager is assigned to this director via department OR SupervisorId
                var isAssignedViaDepartment = manager.DepartmentId.HasValue && manager.Department?.DirectorId == directorId;
                var isAssignedViaSupervisor = manager.SupervisorId == directorId;

                if (!isAssignedViaDepartment && !isAssignedViaSupervisor)
                {
                    return BadRequest(new { message = "Manager is not assigned to this director" });
                }

                // Remove manager from department and clear supervisor link
                if (isAssignedViaDepartment)
                {
                    manager.DepartmentId = null;
                }
                if (isAssignedViaSupervisor)
                {
                    manager.SupervisorId = null;
                }
                manager.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Manager {ManagerId} removed from director {DirectorId}", managerId, directorId);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing manager {ManagerId} from director {DirectorId}", managerId, directorId);
                return StatusCode(500, new { message = "An error occurred while removing manager", error = ex.Message });
            }
        }

        /// <summary>
        /// DELETE /api/admin/directors/{directorId}
        /// Soft-delete (deactivate) a director
        /// Admin-only endpoint
        /// </summary>
        [HttpDelete("{directorId}")]
        public async Task<ActionResult> DeleteDirector(int directorId)
        {
            try
            {
                _logger.LogInformation("Admin deleting (deactivating) director {DirectorId}", directorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to delete director {DirectorId} without Admin role", adminUserId, directorId);
                    return Forbid();
                }

                // Prevent admin from deactivating themselves
                if (directorId == adminUserId)
                {
                    return BadRequest(new { message = "You cannot deactivate yourself" });
                }

                var director = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (director == null)
                {
                    return NotFound(new { message = "Director not found" });
                }

                // Soft-delete: set status to Inactive
                director.Status = UserStatus.Inactive;
                director.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Director {DirectorId} ({DirectorName}) deactivated successfully by admin {AdminUserId}",
                    directorId, director.FullName, adminUserId);

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting director {DirectorId}", directorId);
                return StatusCode(500, new { message = "An error occurred while deleting director", error = ex.Message });
            }
        }

        /// <summary>
        /// PUT /api/admin/directors/{directorId}/managers/{managerId}/transfer
        /// Transfer a manager from one director to another
        /// FIX: Auto-creates department for new director if needed
        /// </summary>
        [HttpPut("{directorId}/managers/{managerId}/transfer")]
        public async Task<ActionResult> TransferManager(int directorId, int managerId, [FromBody] TransferManagerDto dto)
        {
            try
            {
                _logger.LogInformation("Admin transferring manager {ManagerId} from director {DirectorId} to director {NewDirectorId}",
                    managerId, directorId, dto.NewDirectorId);

                var (isAdmin, adminUserId) = await VerifyAdminAccess();
                if (!isAdmin)
                {
                    _logger.LogWarning("User {UserId} attempted to transfer manager without Admin role", adminUserId);
                    return Forbid();
                }

                // Verify old director exists
                var oldDirector = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

                if (oldDirector == null)
                {
                    return NotFound(new { message = "Current director not found" });
                }

                // Verify new director exists
                var newDirector = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == dto.NewDirectorId && u.Role == DomainUserRole.Director);

                if (newDirector == null)
                {
                    return NotFound(new { message = "New director not found" });
                }

                // Verify manager exists
                var manager = await _context.Users
                    .Include(u => u.Department)
                    .FirstOrDefaultAsync(u => u.UserId == managerId && u.Role == DomainUserRole.Manager);

                if (manager == null)
                {
                    return NotFound(new { message = "Manager not found" });
                }

                // FIX: Auto-create department for new director if needed
                var newDepartment = await EnsureDirectorHasDepartment(newDirector);

                // Transfer manager to new department and update supervisor
                manager.DepartmentId = newDepartment.DepartmentId;
                manager.SupervisorId = dto.NewDirectorId;
                manager.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Manager {ManagerId} transferred from director {DirectorId} to director {NewDirectorId}",
                    managerId, directorId, dto.NewDirectorId);

                return Ok(new {
                    message = "Manager transferred successfully",
                    managerId = managerId,
                    oldDirectorId = directorId,
                    newDirectorId = dto.NewDirectorId,
                    newDepartmentId = newDepartment.DepartmentId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error transferring manager {ManagerId}", managerId);
                return StatusCode(500, new { message = "An error occurred while transferring manager", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }

    // DTOs for the admin director endpoints
    public class UpdateDirectorDto
    {
        public string? FullName { get; set; }
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? NewPassword { get; set; }
        public bool IsActive { get; set; } = true;
        public bool CanCreateTeamLeader { get; set; } = false;
        public int? DepartmentId { get; set; }
    }

    public class AssignManagerDto
    {
        public int ManagerId { get; set; }
    }

    public class TransferManagerDto
    {
        public int NewDirectorId { get; set; }
    }
}