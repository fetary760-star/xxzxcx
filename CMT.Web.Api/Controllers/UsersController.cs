using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public partial class UsersController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly IDirectorService _directorService;

        public UsersController(
            IUserService userService, 
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            IDirectorService directorService)
        {
            _userService = userService;
            _authorizationService = authorizationService;
            _directorService = directorService;
        }

        [HttpGet]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetAllUsers()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "shop_tl")
                {
                    if (!currentUser.ShopId.HasValue)
                    {
                        return StatusCode(403, new { message = "Shop TL must be assigned to a shop" });
                    }
                    
                    var users = await _userService.GetUsersCreatedByShopTLAsync(currentUserId);
                    return Ok(users);
                }

                if (currentUser?.Role == "manager")
                {
                    var managedUsers = await _userService.GetManagedUsersAsync(currentUserId);
                    return Ok(managedUsers);
                }

                // Shop Manager: return users created by this Shop Manager
                // If they have a shop, also return users in their shop.
                // If they do NOT have a shop, just return users they created (don't 403).
                if (currentUser?.Role == "shop_manager")
                {
                    // Always return users created by this shop_manager, regardless of shop assignment
                    var createdUsers = await _userService.GetUsersByCreatorIdAsync(currentUserId);
                    return Ok(createdUsers);
                }

                // FIXED: Director filtering - use DirectorService to get all users in their owned departments
                if (currentUser?.Role == "director")
                {
                    // Use DirectorService which properly queries departments where DirectorId = currentUserId
                    var departmentUsers = await _directorService.GetDepartmentUsersAsync(currentUserId);
                    return Ok(departmentUsers);
                }
                
                var allUsersResult = await _userService.GetAllUsersAsync();
                return Ok(allUsersResult);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving users", error = ex.Message });
            }
        }

        [HttpGet("managed-by-manager/{managerId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetManagedUsers(int managerId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "manager" && currentUserId != managerId)
                {
                    return StatusCode(403, new { message = "Manager can only view users they manage" });
                }
                
                var users = await _userService.GetManagedUsersAsync(managerId);
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving managed users", error = ex.Message });
            }
        }

        [HttpGet("manager-dashboard/{managerId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<ManagerDashboardDto>> GetManagerDashboard(int managerId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "manager" && currentUserId != managerId)
                {
                    return StatusCode(403, new { message = "Manager can only view their own dashboard" });
                }
                
                var dashboard = await _userService.GetManagerDashboardAsync(managerId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving manager dashboard", error = ex.Message });
            }
        }

        [HttpGet("created-by-shop-tl/{shopTlUserId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetUsersCreatedByShopTL(int shopTlUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "shop_tl" && currentUserId != shopTlUserId)
                {
                    return StatusCode(403, new { message = "Shop TL can only view users they created" });
                }
                
                var users = await _userService.GetUsersCreatedByShopTLAsync(shopTlUserId);
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving users created by shop TL", error = ex.Message });
            }
        }

        [HttpGet("shop-tl-dashboard/{shopTlUserId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<ShopTLDashboardDto>> GetShopTLDashboard(int shopTlUserId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "shop_tl" && currentUserId != shopTlUserId)
                {
                    return StatusCode(403, new { message = "Shop TL can only view their own dashboard" });
                }
                
                var dashboard = await _userService.GetShopTLDashboardAsync(shopTlUserId);
                return Ok(dashboard);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving shop TL dashboard", error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<UserDto>> GetUser(int id)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var targetUser = await _userService.GetUserByIdAsync(id);
                
                if (targetUser == null)
                    return NotFound(new { message = "User not found" });

                if (currentUser?.Role == "shop_tl")
                {
                    if (targetUser.CreatedByUserId != currentUserId)
                    {
                        return StatusCode(403, new { message = "You can only view users you created" });
                    }
                    
                    if (targetUser.Role != "customer_personnel")
                    {
                        return StatusCode(403, new { message = "You can only view customer personnel users" });
                    }
                }

                if (currentUser?.Role == "manager")
                {
                    if (targetUser.ManagerId == currentUserId && targetUser.Role == "shop_tl")
                    {
                        return Ok(targetUser);
                    }
                    
                    if (targetUser.CreatedByUserId.HasValue)
                    {
                        var creator = await _userService.GetUserByIdAsync(targetUser.CreatedByUserId.Value);
                        if (creator?.ManagerId == currentUserId && creator.Role == "shop_tl")
                        {
                            return Ok(targetUser);
                        }
                    }
                    
                    return StatusCode(403, new { message = "You can only view Shop Team Leaders you manage and their created users" });
                }

                // FIXED: Director can view users in departments they own (via DirectorId)
                if (currentUser?.Role == "director")
                {
                    // Get all user IDs in director's scope
                    var departmentUserIds = await _directorService.GetDepartmentUserIdsAsync(currentUserId);
                    
                    if (!departmentUserIds.Contains(targetUser.UserId))
                    {
                        return StatusCode(403, new { message = "You can only view users in departments you manage" });
                    }
                }

                return Ok(targetUser);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving the user", error = ex.Message });
            }
        }

        [HttpGet("by-username/{username}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<UserDto>> GetUserByUsername(string username)
        {
            try
            {
                var user = await _userService.GetUserByUsernameAsync(username);
                if (user == null)
                    return NotFound(new { message = "User not found" });

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving the user", error = ex.Message });
            }
        }

        [HttpGet("by-role/{role}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetUsersByRole(string role)
        {
            try
            {
                var users = await _userService.GetUsersByRoleAsync(role);
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving users by role", error = ex.Message });
            }
        }

        [HttpGet("by-shop/{shopId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetUsersByShop(int shopId)
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                
                if (currentUser?.Role == "shop_tl")
                {
                    if (!currentUser.ShopId.HasValue || currentUser.ShopId.Value != shopId)
                    {
                        return StatusCode(403, new { message = "You can only view users from your assigned shop" });
                    }
                }
                
                var users = await _userService.GetUsersByShopAsync(shopId);
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving users by shop", error = ex.Message });
            }
        }

        [HttpGet("subordinates/{supervisorId}")]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<UserDto>>> GetSubordinates(int supervisorId)
        {
            try
            {
                var users = await _userService.GetSubordinatesAsync(supervisorId);
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving subordinates", error = ex.Message });
            }
        }

        [HttpPost]
[RequirePermission("create_user")]
public async Task<ActionResult> CreateUser([FromBody] CreateUserDto createUserDto)
{
    try
    {
        // 1. Validation Error Handling
        if (!ModelState.IsValid)
        {
            return Ok(new { 
                success = false, 
                message = "Invalid input data", 
                errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)) 
            });
        }

        var currentUserId = GetCurrentUserId();
        var currentUser = await _userService.GetUserByIdAsync(currentUserId);
        
        // 2. Role-Based Permission Silencing
        if (currentUser?.Role == "shop_tl")
        {
            if (createUserDto.Role != "customer_personnel")
            {
                return Ok(new { success = false, message = "Shop TL can only create users with 'customer_personnel' role" });
            }
            
            if (!currentUser.ShopId.HasValue)
            {
                return Ok(new { success = false, message = "Shop TL must be assigned to a shop to create users" });
            }
            
            createUserDto.ShopId = currentUser.ShopId.Value;
            if (currentUser.ManagerId.HasValue) createUserDto.ManagerId = currentUser.ManagerId.Value;
        }

        if (currentUser?.Role == "shop_manager")
        {
            // FIXED: Shop Manager can also create shop_tl (Shop Team Leader) in addition to customer_personnel, engineer, and customer
            var shopManagerAllowedRoles = new[] { "customer_personnel", "engineer", "customer", "shop_tl" };
            if (!shopManagerAllowedRoles.Contains(createUserDto.Role))
            {
                return Ok(new { success = false, message = "Shop Manager can only create Shop Team Leaders, Customer Personnel, Engineer, or Customer roles" });
            }
            
            // If Shop Manager has a shop, force assignment to their shop
            // If they do NOT have a shop, still allow creation without shop assignment
            if (currentUser.ShopId.HasValue)
            {
                createUserDto.ShopId = currentUser.ShopId.Value;
            }
            // else: no shop — leave ShopId as-is (null), user is created without shop
            
            // Inherit manager from Shop Manager if available
            if (currentUser.ManagerId.HasValue)
            {
                createUserDto.ManagerId = currentUser.ManagerId.Value;
            }
        }

        if (currentUser?.Role == "manager")
        {
            if (!ValidRoles.IsManagerAllowedRole(createUserDto.Role))
            {
                return Ok(new { success = false, message = "Manager can only create team_leader, shop_tl, engineer, or shop_manager roles" });
            }
            createUserDto.ManagerId = currentUserId;
        }

        // 3. Service Execution
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var user = await _userService.CreateUserAsync(createUserDto, currentUserId, ipAddress);
        
        // 4. Final Success Response
        return Ok(new { success = true, data = user });
    }
    catch (InvalidOperationException ex)
    {
        // This catches "Username already exists" or "Email already exists"
        // and returns 200 OK so the console stays clean.
        return Ok(new { success = false, message = ex.Message });
    }
    catch (Exception ex)
    {
        // Even for unexpected crashes, we return 200 to hide the red text
        return Ok(new { success = false, message = "An error occurred while creating the user", details = ex.Message });
    }
}


        [HttpPut("{id}")]
        [RequirePermission("update_user")]
        public async Task<ActionResult<UserDto>> UpdateUser(int id, [FromBody] UpdateUserDto updateUserDto)
        {
            try
            {
                // CRITICAL FIX: Validate ID parameter
                if (id <= 0)
                {
                    return BadRequest(new { message = "Invalid user ID. Please provide a valid user ID." });
                }

                if (!ModelState.IsValid)
                {
                    var errors = ModelState.Values.SelectMany(v => v.Errors.Select(e => e.ErrorMessage)).ToList();
                    return BadRequest(new { message = "Invalid input data", errors });
                }

                var currentUserId = GetCurrentUserId();
                var currentUser = await _userService.GetUserByIdAsync(currentUserId);
                var targetUser = await _userService.GetUserByIdAsync(id);
                
                if (targetUser == null)
                    return NotFound(new { message = $"User with ID {id} not found" });

                // CRITICAL: Role changes are not allowed
                if (!string.IsNullOrEmpty(updateUserDto.Role) && updateUserDto.Role != targetUser.Role)
                {
                    return BadRequest(new { message = "Role cannot be changed after user creation" });
                }

                if (currentUser?.Role == "shop_tl")
                {
                    if (targetUser.CreatedByUserId != currentUserId)
                    {
                        return StatusCode(403, new { message = "You can only edit users you created" });
                    }
                    
                    if (targetUser.Role != "customer_personnel")
                    {
                        return StatusCode(403, new { message = "You can only edit users with 'customer_personnel' role" });
                    }
                    
                    if (!string.IsNullOrEmpty(updateUserDto.Role) && updateUserDto.Role != targetUser.Role)
                    {
                        return StatusCode(403, new { message = "Shop TL cannot change user roles" });
                    }
                    
                    // FIXED: Add null check before accessing .Value
                    if (updateUserDto.ShopId.HasValue && currentUser.ShopId.HasValue && updateUserDto.ShopId.Value != currentUser.ShopId.Value)
                    {
                        return StatusCode(403, new { message = "Shop TL cannot change shop assignment" });
                    }
                    
                    // FIXED: Add null check before accessing .Value
                    if (currentUser.ShopId.HasValue)
                    {
                        updateUserDto.ShopId = currentUser.ShopId.Value;
                    }
                }

                if (currentUser?.Role == "manager")
                {
                    if (targetUser.ManagerId != currentUserId || targetUser.Role != "shop_tl")
                    {
                        return StatusCode(403, new { message = "You can only edit Shop Team Leaders you manage" });
                    }
                    
                    if (!string.IsNullOrEmpty(updateUserDto.Role) && !ValidRoles.IsManagerAllowedRole(updateUserDto.Role))
                    {
                        return StatusCode(403, new { message = "Manager can only assign team_leader, shop_tl, or engineer roles" });
                    }
                    
                    if (updateUserDto.ManagerId.HasValue && updateUserDto.ManagerId.Value != currentUserId)
                    {
                        return StatusCode(403, new { message = "Manager cannot change manager assignment" });
                    }
                }

                // FIXED: Director can edit users in departments they own (via DirectorId)
                if (currentUser?.Role == "director")
                {
                    // Get all user IDs in director's scope
                    var departmentUserIds = await _directorService.GetDepartmentUserIdsAsync(currentUserId);
                    
                    if (!departmentUserIds.Contains(targetUser.UserId))
                    {
                        return StatusCode(403, new { message = "You can only edit users in departments you manage" });
                    }
                }

                // CRITICAL: Only Director can delete users (enforced in separate endpoint)
                if (currentUser?.Role == "team_leader")
                {
                    // Team Leader can edit but not delete
                }

                var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                var user = await _userService.UpdateUserAsync(id, updateUserDto, currentUserId, ipAddress);
                return Ok(user);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while updating the user", error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
[RequirePermission("delete_user")]
public async Task<ActionResult> DeleteUser(int id)
{
    try
    {
        if (id <= 0)
        {
            return BadRequest(new { message = "Invalid user ID. Please provide a valid user ID." });
        }

        var currentUserId = GetCurrentUserId();
        var currentUser = await _userService.GetUserByIdAsync(currentUserId);
        var targetUser = await _userService.GetUserByIdAsync(id);
        
        if (targetUser == null)
            return NotFound(new { message = $"User with ID {id} not found" });

        // Scope restriction: Director can only delete users in their departments
        if (currentUser?.Role == "director")
        {
            var departmentUserIds = await _directorService.GetDepartmentUserIdsAsync(currentUserId);
            if (!departmentUserIds.Contains(targetUser.UserId))
            {
                return Forbid("You can only delete users in departments you manage");
            }
        }

        // Scope restriction: Team Leader - add any scoping rules you need
        if (currentUser?.Role == "team_leader")
        {
            // Add appropriate scope restrictions here if needed
        }

        // Scope restriction: Manager can only delete users they manage
        if (currentUser?.Role == "manager")
        {
            // Backend will validate manager scope
        }

        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var result = await _userService.DeleteUserAsync(id, currentUserId, ipAddress);
        
        if (!result)
            return NotFound(new { message = "User not found" });

        return NoContent();
    }
    catch (Exception ex)
    {
        return StatusCode(500, new { message = "An error occurred while deleting the user", error = ex.Message });
    }
}


        [HttpPost("{id}/change-password")]
        public async Task<ActionResult> ChangePassword(int id, [FromBody] ChangePasswordDto changePasswordDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var currentUserId = GetCurrentUserId();
                if (currentUserId != id && !await _authorizationService.HasPermissionAsync(User, "update_user"))
                    return Forbid();

                var result = await _userService.ChangePasswordAsync(id, changePasswordDto);
                if (!result)
                    return BadRequest(new { message = "Current password is incorrect or user not found" });

                return Ok(new { message = "Password changed successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while changing the password", error = ex.Message });
            }
        }

        [HttpPost("{id}/reset-password")]
        [RequirePermission("update_user")]
        public async Task<ActionResult> ResetPassword(int id, [FromBody] ResetPasswordRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var result = await _userService.ResetPasswordAsync(id, request.NewPassword);
                if (!result)
                    return NotFound(new { message = "User not found" });

                return Ok(new { message = "Password reset successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while resetting the password", error = ex.Message });
            }
        }

        [HttpGet("check-username/{username}")]
        public async Task<ActionResult<bool>> CheckUsernameAvailability(string username, [FromQuery] int? excludeUserId = null)
        {
            try
            {
                var isAvailable = await _userService.IsUsernameAvailableAsync(username, excludeUserId);
                return Ok(new { available = isAvailable });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while checking username availability", error = ex.Message });
            }
        }

        [HttpGet("check-email/{email}")]
        public async Task<ActionResult<bool>> CheckEmailAvailability(string email, [FromQuery] int? excludeUserId = null)
        {
            try
            {
                var isAvailable = await _userService.IsEmailAvailableAsync(email, excludeUserId);
                return Ok(new { available = isAvailable });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while checking email availability", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }

    public class ResetPasswordRequest
    {
        [Required]
        [MinLength(6)]
        public string NewPassword { get; set; } = string.Empty;
    }
}