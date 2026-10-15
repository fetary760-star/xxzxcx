using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DepartmentsController : ControllerBase
    {
        private readonly IDepartmentService _departmentService;
        private readonly IUserService _userService;

        public DepartmentsController(IDepartmentService departmentService, IUserService userService)
        {
            _departmentService = departmentService;
            _userService = userService;
        }

        [HttpGet]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<DepartmentDto>>> GetAllDepartments()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Directors see only their departments
                if (currentUser?.Role == "director")
                {
                    var departments = await _departmentService.GetDepartmentsByDirectorAsync(currentUserId);
                    return Ok(departments);
                }

                // Managers see only their assigned department
                if (currentUser?.Role == "manager")
                {
                    if (!currentUser.DepartmentId.HasValue)
                    {
                        return Ok(new List<DepartmentDto>());
                    }
                    var department = await _departmentService.GetDepartmentByIdAsync(currentUser.DepartmentId.Value);
                    return Ok(department != null ? new List<DepartmentDto> { department } : new List<DepartmentDto>());
                }

                // Team Leaders, Admin and above see all departments
                var allDepartments = await _departmentService.GetAllDepartmentsAsync();
                return Ok(allDepartments);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving departments", error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<DepartmentDto>> GetDepartment(int id)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var department = await _departmentService.GetDepartmentByIdAsync(id);

                if (department == null)
                    return NotFound(new { message = "Department not found" });

                // Directors can only view their own departments
                if (currentUser?.Role == "director" && department.DirectorId != currentUserId)
                {
                    return Forbid("You can only view departments you created");
                }

                // Managers can only view their assigned department
                if (currentUser?.Role == "manager" && department.ManagerId != currentUserId)
                {
                    return Forbid("You can only view your assigned department");
                }

                return Ok(department);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving the department", error = ex.Message });
            }
        }

        [HttpGet("{id}/hierarchy")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<DepartmentWithHierarchyDto>> GetDepartmentHierarchy(int id)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var department = await _departmentService.GetDepartmentByIdAsync(id);

                if (department == null)
                    return NotFound(new { message = "Department not found" });

                // Directors can only view their own departments
                if (currentUser?.Role == "director" && department.DirectorId != currentUserId)
                {
                    return Forbid("You can only view departments you created");
                }

                // Managers can only view their assigned department
                if (currentUser?.Role == "manager" && department.ManagerId != currentUserId)
                {
                    return Forbid("You can only view your assigned department");
                }

                var hierarchy = await _departmentService.GetDepartmentHierarchyAsync(id);
                return Ok(hierarchy);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving department hierarchy", error = ex.Message });
            }
        }

        [HttpGet("by-director/{directorId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<DepartmentDto>>> GetDepartmentsByDirector(int directorId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Directors can only view their own departments
                if (currentUser?.Role == "director" && currentUserId != directorId)
                {
                    return Forbid("You can only view departments you created");
                }

                var departments = await _departmentService.GetDepartmentsByDirectorAsync(directorId);
                return Ok(departments);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving departments", error = ex.Message });
            }
        }

        [HttpGet("director-dashboard/{directorId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<DirectorDashboardDto>> GetDirectorDashboard(int directorId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Directors can only view their own dashboard
                if (currentUser?.Role == "director" && currentUserId != directorId)
                {
                    return Forbid("You can only view your own dashboard");
                }

                var dashboard = await _departmentService.GetDirectorDashboardAsync(directorId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving director dashboard", error = ex.Message });
            }
        }

        [HttpPost]
        [RequirePermission("create_user")]
        public async Task<ActionResult<DepartmentDto>> CreateDepartment([FromBody] CreateDepartmentDto createDepartmentDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(new { message = "Invalid input data", errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)) });

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);

                // Directors and Admins can create departments
                if (currentUser?.Role != "director" && currentUser?.Role != "admin")
                {
                    return Forbid("Only Directors and Admins can create departments");
                }

                var department = await _departmentService.CreateDepartmentAsync(createDepartmentDto, currentUserId);
                return CreatedAtAction(nameof(GetDepartment), new { id = department.DepartmentId }, department);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while creating the department", error = ex.Message });
            }
        }

        [HttpPut("{id}")]
        [RequirePermission("update_user")]
        public async Task<ActionResult<DepartmentDto>> UpdateDepartment(int id, [FromBody] UpdateDepartmentDto updateDepartmentDto)
        {
            try
            {
                if (id <= 0)
                {
                    return BadRequest(new { message = "Invalid department ID" });
                }

                if (!ModelState.IsValid)
                {
                    var errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)).ToList();
                    return BadRequest(new { message = "Invalid input data", errors });
                }

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var department = await _departmentService.GetDepartmentByIdAsync(id);

                if (department == null)
                    return NotFound(new { message = $"Department with ID {id} not found" });

                // Directors can only update their own departments
                if (currentUser?.Role == "director" && department.DirectorId != currentUserId)
                {
                    return Forbid("You can only update departments you created");
                }

                // Managers cannot update departments
                if (currentUser?.Role == "manager")
                {
                    return Forbid("Managers cannot update department details");
                }

                var updatedDepartment = await _departmentService.UpdateDepartmentAsync(id, updateDepartmentDto, currentUserId);
                return Ok(updatedDepartment);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while updating the department", error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        [RequirePermission("delete_user")]
        public async Task<ActionResult> DeleteDepartment(int id)
        {
            try
            {
                if (id <= 0)
                {
                    return BadRequest(new { message = "Invalid department ID" });
                }

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var department = await _departmentService.GetDepartmentByIdAsync(id);

                if (department == null)
                    return NotFound(new { message = $"Department with ID {id} not found" });

                // Only Directors and Admins can delete departments
                if (currentUser?.Role != "director" && currentUser?.Role != "admin")
                {
                    return Forbid("Only Directors and Admins can delete departments");
                }

                // Directors can only delete their own departments
                if (currentUser?.Role == "director" && department.DirectorId != currentUserId)
                {
                    return Forbid("You can only delete departments you created");
                }

                var result = await _departmentService.DeleteDepartmentAsync(id, currentUserId);
                if (!result)
                    return NotFound(new { message = "Department not found" });

                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while deleting the department", error = ex.Message });
            }
        }

        [HttpPost("{departmentId}/assign-manager/{managerId}")]
        [RequirePermission("update_user")]
        public async Task<ActionResult> AssignManager(int departmentId, int managerId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var department = await _departmentService.GetDepartmentByIdAsync(departmentId);

                if (department == null)
                    return NotFound(new { message = "Department not found" });

                // Only Directors and Admins can assign managers
                if (currentUser?.Role != "director" && currentUser?.Role != "admin")
                {
                    return Forbid("Only Directors and Admins can assign managers to departments");
                }

                // Directors can only assign managers to their own departments
                if (currentUser?.Role == "director" && department.DirectorId != currentUserId)
                {
                    return Forbid("You can only assign managers to departments you created");
                }

                var result = await _departmentService.AssignManagerToDepartmentAsync(departmentId, managerId, currentUserId);
                if (!result)
                    return BadRequest(new { message = "Failed to assign manager" });

                return Ok(new { message = "Manager assigned successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while assigning manager", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }
}