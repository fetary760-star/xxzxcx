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
    public class ShopsController : ControllerBase
    {
        private readonly IShopService _shopService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly IUserService _userService;

        public ShopsController(IShopService shopService, CMT.Application.Interfaces.IAuthorizationService authorizationService, IUserService userService)
        {
            _shopService = shopService;
            _authorizationService = authorizationService;
            _userService = userService;
        }

        /// <summary>
        /// Get all shops - accessible by all authenticated users
        /// ENHANCED: Shop Team Leaders now have full access to all shops
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<List<ShopDto>>> GetAllShops()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await GetCurrentUserAsync();
                
                // Get shops based on user role
                List<ShopDto> shops;
                
                // Directors, Team Leaders, Managers, and Shop Team Leaders can see all shops
                if (currentUser?.Role == "director" || 
                    currentUser?.Role == "team_leader" ||
                    currentUser?.Role == "manager" ||
                    currentUser?.Role == "shop_tl")
                {
                    shops = await _shopService.GetAllShopsAsync();
                }
                // Other users can see all active shops (for reference)
                else
                {
                    shops = await _shopService.GetActiveShopsAsync();
                }
                
                return Ok(shops);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving shops", error = ex.Message });
            }
        }

        /// <summary>
        /// Get a specific shop by ID
        /// ENHANCED: Shop Team Leaders can access any shop
        /// </summary>
        [HttpGet("{id}")]
        public async Task<ActionResult<ShopDto>> GetShop(int id)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user can access this shop
                // Directors, Team Leaders, Managers, and Shop Team Leaders can access any shop
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl" &&
                    !await _authorizationService.CanAccessShopAsync(User, id))
                {
                    return StatusCode(403, new { message = "You don't have permission to access this shop" });
                }

                var shop = await _shopService.GetShopByIdAsync(id);
                if (shop == null)
                    return NotFound(new { message = "Shop not found" });

                return Ok(shop);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving the shop", error = ex.Message });
            }
        }

        /// <summary>
        /// Create a new shop - accessible by Directors, Team Leaders, Managers, and Shop Team Leaders
        /// ENHANCED: Managers and Shop Team Leaders can now create shops
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<ShopDto>> CreateShop([FromBody] CreateShopDto createShopDto)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user has permission to manage shops
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { message = "You don't have permission to create shops. Only Directors, Team Leaders, Managers, and Shop Team Leaders can create shops." });
                }

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var currentUserId = GetCurrentUserId();
                var shop = await _shopService.CreateShopAsync(createShopDto, currentUserId);
                return CreatedAtAction(nameof(GetShop), new { id = shop.ShopId }, shop);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while creating the shop", error = ex.Message });
            }
        }

        /// <summary>
        /// Update an existing shop - accessible by Directors, Team Leaders, Managers, and Shop Team Leaders
        /// ENHANCED: Managers and Shop Team Leaders can now edit any shop
        /// </summary>
        [HttpPut("{id}")]
        public async Task<ActionResult<ShopDto>> UpdateShop(int id, [FromBody] UpdateShopDto updateShopDto)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user can manage shops
                // Directors, Team Leaders, Managers, and Shop Team Leaders can manage any shop
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { message = "You don't have permission to edit shops. Only Directors, Team Leaders, Managers, and Shop Team Leaders can edit shops." });
                }

                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var currentUserId = GetCurrentUserId();
                var shop = await _shopService.UpdateShopAsync(id, updateShopDto, currentUserId);
                
                if (shop == null)
                    return NotFound(new { message = "Shop not found" });

                return Ok(shop);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while updating the shop", error = ex.Message });
            }
        }

        /// <summary>
        /// Delete a shop - accessible by Directors, Team Leaders, Managers, and Shop Team Leaders
        /// ENHANCED: Managers and Shop Team Leaders can now delete shops
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteShop(int id)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user has permission to manage shops
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { message = "You don't have permission to delete shops. Only Directors, Team Leaders, Managers, and Shop Team Leaders can delete shops." });
                }

                var currentUserId = GetCurrentUserId();
                var result = await _shopService.DeleteShopAsync(id, currentUserId);
                
                if (!result)
                    return NotFound(new { message = "Shop not found" });

                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while deleting the shop", error = ex.Message });
            }
        }

        /// <summary>
        /// Get active shops - accessible by all authenticated users
        /// ENHANCED: Shop Team Leaders have full access
        /// </summary>
        [HttpGet("active")]
        public async Task<ActionResult<List<ShopDto>>> GetActiveShops()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var currentUser = await GetCurrentUserAsync();
                
                // Get shops based on user role
                List<ShopDto> shops;
                
                // Directors, Team Leaders, Managers, and Shop Team Leaders can see all active shops
                if (currentUser?.Role == "director" || 
                    currentUser?.Role == "team_leader" ||
                    currentUser?.Role == "manager" ||
                    currentUser?.Role == "shop_tl")
                {
                    shops = await _shopService.GetActiveShopsAsync();
                }
                // Other users can see all active shops
                else
                {
                    shops = await _shopService.GetActiveShopsAsync();
                }
                
                return Ok(shops);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving active shops", error = ex.Message });
            }
        }

        /// <summary>
        /// Assign team leader to a shop - accessible by Directors, Team Leaders, Managers, and Shop Team Leaders
        /// ENHANCED: Managers and Shop Team Leaders can now assign team leaders
        /// </summary>
        [HttpPost("{shopId}/assign-team-leader/{teamLeaderId}")]
        public async Task<ActionResult> AssignTeamLeader(int shopId, int teamLeaderId)
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user has permission to manage shops
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { message = "You don't have permission to assign team leaders. Only Directors, Team Leaders, Managers, and Shop Team Leaders can assign team leaders." });
                }

                var currentUserId = GetCurrentUserId();
                var result = await _shopService.AssignTeamLeaderAsync(shopId, teamLeaderId, currentUserId);
                
                if (!result)
                    return BadRequest(new { message = "Failed to assign team leader" });

                return Ok(new { message = "Team leader assigned successfully" });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while assigning team leader", error = ex.Message });
            }
        }

        /// <summary>
        /// Get shops with team leaders - accessible by Directors, Team Leaders, Managers, and Shop Team Leaders
        /// ENHANCED: Managers and Shop Team Leaders can view all shops with team leaders
        /// </summary>
        [HttpGet("with-team-leaders")]
        public async Task<ActionResult<List<ShopDto>>> GetShopsWithTeamLeaders()
        {
            try
            {
                var currentUser = await GetCurrentUserAsync();
                
                // Check if user has permission to view all shops
                if (currentUser?.Role != "director" && 
                    currentUser?.Role != "team_leader" && 
                    currentUser?.Role != "manager" &&
                    currentUser?.Role != "shop_tl")
                {
                    return StatusCode(403, new { message = "You don't have permission to view shops with team leaders" });
                }

                var shops = await _shopService.GetShopsWithTeamLeadersAsync();
                return Ok(shops);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving shops with team leaders", error = ex.Message });
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }

        private async Task<UserDto?> GetCurrentUserAsync()
        {
            var userId = GetCurrentUserId();
            if (userId == 0) return null;

            // Use the injected user service to get the current user
            return await _userService.GetUserByIdAsync(userId);
        }
    }
}