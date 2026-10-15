using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.Data;
using DomainUserRole = CMT.Domain.Models.UserRole;

namespace CMT.Web.Api.Controllers
{
    public partial class UsersController
    {
        /// <summary>
        /// Admin endpoint to get comprehensive dashboard data
        /// </summary>
        [HttpGet("admin-dashboard/{userId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<AdminDashboardDto>> GetAdminDashboard(int userId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only Admin can access this endpoint
                if (currentUser?.Role != "admin")
                {
                    return Forbid("Only Admin can access the admin dashboard");
                }

                // Verify the requested userId matches the current admin user
                if (currentUserId != userId)
                {
                    return Forbid("You can only access your own admin dashboard");
                }

                var context = HttpContext.RequestServices.GetRequiredService<ApplicationDbContext>();

                // Get all directors with their statistics
                var directors = await context.Users
                    .Where(u => u.Role == DomainUserRole.Director && u.Status == CMT.Domain.Models.UserStatus.Active)
                    .Select(d => new DirectorSummaryDto
                    {
                        UserId = d.UserId,
                        FullName = d.FullName,
                        Username = d.Username,
                        Email = d.Email,
                        DepartmentCount = context.Departments.Count(dept => dept.DirectorId == d.UserId && dept.IsActive),
                        ManagerCount = context.Users.Count(u => u.DepartmentId.HasValue && 
                            context.Departments.Any(dept => dept.DirectorId == d.UserId && dept.DepartmentId == u.DepartmentId.Value) &&
                            u.Role == DomainUserRole.Manager && 
                            u.Status == CMT.Domain.Models.UserStatus.Active),
                        TotalTeamMembers = context.Users.Count(u => u.DepartmentId.HasValue &&
                            context.Departments.Any(dept => dept.DirectorId == d.UserId && dept.DepartmentId == u.DepartmentId.Value) &&
                            u.Status == CMT.Domain.Models.UserStatus.Active),
                        IsActive = true,
                        CreatedAt = d.CreatedAt,
                        CanCreateTeamLeader = d.CanCreateTeamLeader
                    })
                    .ToListAsync();

                // Get system-wide statistics
                var totalDirectors = await context.Users.CountAsync(u => u.Role == DomainUserRole.Director && u.Status == CMT.Domain.Models.UserStatus.Active);
                var totalManagers = await context.Users.CountAsync(u => u.Role == DomainUserRole.Manager && u.Status == CMT.Domain.Models.UserStatus.Active);
                var totalShopTeamLeaders = await context.Users.CountAsync(u => u.Role == DomainUserRole.ShopTL && u.Status == CMT.Domain.Models.UserStatus.Active);
                var totalEngineers = await context.Users.CountAsync(u => u.Role == DomainUserRole.Engineer && u.Status == CMT.Domain.Models.UserStatus.Active);
                var totalCustomerPersonnel = await context.Users.CountAsync(u => u.Role == DomainUserRole.CustomerPersonnel && u.Status == CMT.Domain.Models.UserStatus.Active);

                // Get task statistics
                var totalActiveTasks = await context.Tasks.CountAsync(t => t.RecordStatus == CMT.Domain.Models.RecordStatus.Active);
                var totalCompletedTasks = await context.CompletedTasks.CountAsync(ct => ct.RecordStatus == CMT.Domain.Models.RecordStatus.Active);

                // Get recent tasks (mix of active and completed)
                var recentActiveTasks = await context.Tasks
                    .Where(t => t.RecordStatus == CMT.Domain.Models.RecordStatus.Active)
                    .OrderByDescending(t => t.CreatedAt)
                    .Take(5)
                    .Include(t => t.Creator)
                    .Select(t => new RecentTaskSummaryDto
                    {
                        TaskId = t.TaskId,
                        Description = t.Description,
                        Status = t.Status.ToString(),
                        CreatedByName = t.Creator != null ? t.Creator.FullName : "Unknown",
                        CreatedAt = t.CreatedAt
                    })
                    .ToListAsync();

                var recentCompletedTasks = await context.CompletedTasks
                    .Where(ct => ct.RecordStatus == CMT.Domain.Models.RecordStatus.Active)
                    .OrderByDescending(ct => ct.CompletedAt)
                    .Take(5)
                    .Include(ct => ct.Creator)
                    .Select(ct => new RecentTaskSummaryDto
                    {
                        TaskId = ct.OriginalTaskId,
                        Description = ct.Description,
                        Status = "Completed",
                        CreatedByName = ct.Creator != null ? ct.Creator.FullName : "Unknown",
                        CreatedAt = ct.TaskCreatedAt
                    })
                    .ToListAsync();

                var recentTasks = recentActiveTasks
                    .Concat(recentCompletedTasks)
                    .OrderByDescending(t => t.CreatedAt)
                    .Take(10)
                    .ToList();

                var dashboardData = new AdminDashboardDto
                {
                    AdminUserId = userId,
                    AdminName = currentUser.FullName,
                    Directors = directors,
                    TotalDirectors = totalDirectors,
                    TotalManagers = totalManagers,
                    TotalShopTeamLeaders = totalShopTeamLeaders,
                    TotalEngineers = totalEngineers,
                    TotalCustomerPersonnel = totalCustomerPersonnel,
                    TotalActiveTasks = totalActiveTasks,
                    TotalCompletedTasks = totalCompletedTasks,
                    RecentTasks = recentTasks
                };

                return Ok(dashboardData);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving admin dashboard", error = ex.Message });
            }
        }

        /// <summary>
        /// Admin endpoint to create a Director with department assignment
        /// UPDATED: Supports optional Team Leader permission
        /// </summary>
        [HttpPost("create-director")]
        [RequirePermission("create_user")]
        public async Task<ActionResult<UserDto>> CreateDirectorWithDepartment([FromBody] CreateUserDto createUserDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new { message = "Invalid input data", errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)) });

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Only Admin can use this endpoint
                if (currentUser?.Role != "admin")
                {
                    return Forbid("Only Admin can create Directors");
                }

                // Force role to director
                createUserDto.Role = "director";

                // Validate department assignment
                bool creatingNewDepartment = !string.IsNullOrEmpty(createUserDto.NewDepartmentName);
                bool assigningExistingDepartment = createUserDto.DepartmentId.HasValue && createUserDto.DepartmentId.Value > 0;

                if (!creatingNewDepartment && !assigningExistingDepartment)
                {
                    return BadRequest(new { message = "Director must be assigned to a department. Either select an existing department or create a new one." });
                }

                if (creatingNewDepartment && assigningExistingDepartment)
                {
                    return BadRequest(new { message = "Cannot both create a new department and assign to an existing one. Please choose one option." });
                }

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();

                // If creating a new department, create it first
                if (creatingNewDepartment)
                {
                    // First create the director user without department
                    var directorUser = await _userService.CreateUserAsync(createUserDto, currentUserId, ipAddress);

                    // Then create the department with this director
                    var departmentService = HttpContext.RequestServices.GetRequiredService<IDepartmentService>();
                    var newDepartment = await departmentService.CreateDepartmentAsync(
                        new CreateDepartmentDto
                        {
                            Name = createUserDto.NewDepartmentName!,
                            Description = createUserDto.NewDepartmentDescription
                        },
                        directorUser.UserId
                    );

                    // Update the director's department assignment
                    await _userService.UpdateUserAsync(
                        directorUser.UserId,
                        new UpdateUserDto { DepartmentId = newDepartment.DepartmentId },
                        currentUserId,
                        ipAddress
                    );

                    // Return the updated director with department info
                    return CreatedAtAction(nameof(GetUser), new { id = directorUser.UserId }, await _userService.GetUserByIdAsync(directorUser.UserId));
                }
                else
                {
                    // Validate existing department
                    var departmentService = HttpContext.RequestServices.GetRequiredService<IDepartmentService>();
                    var existingDepartment = await departmentService.GetDepartmentByIdAsync(createUserDto.DepartmentId!.Value);
                    
                    if (existingDepartment == null)
                    {
                        return BadRequest(new { message = $"Department with ID {createUserDto.DepartmentId.Value} not found" });
                    }

                    // Create director with existing department
                    var directorUser = await _userService.CreateUserAsync(createUserDto, currentUserId, ipAddress);
                    return CreatedAtAction(nameof(GetUser), new { id = directorUser.UserId }, directorUser);
                }
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while creating the director", error = ex.Message });
            }
        }
    }

    // DTOs for Admin Dashboard
    public class AdminDashboardDto
    {
        public int AdminUserId { get; set; }
        public string AdminName { get; set; } = string.Empty;
        public List<DirectorSummaryDto> Directors { get; set; } = new List<DirectorSummaryDto>();
        public int TotalDirectors { get; set; }
        public int TotalManagers { get; set; }
        public int TotalShopTeamLeaders { get; set; }
        public int TotalEngineers { get; set; }
        public int TotalCustomerPersonnel { get; set; }
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public List<RecentTaskSummaryDto> RecentTasks { get; set; } = new List<RecentTaskSummaryDto>();
    }

    public class DirectorSummaryDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int DepartmentCount { get; set; }
        public int ManagerCount { get; set; }
        public int TotalTeamMembers { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public bool CanCreateTeamLeader { get; set; } = false;
    }

    public class RecentTaskSummaryDto
    {
        public int TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string CreatedByName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }
}