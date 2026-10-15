using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class EngineersController : ControllerBase
    {
        private readonly IUserService _userService;

        public EngineersController(IUserService userService)
        {
            _userService = userService;
        }

        /// <summary>
        /// OPTIMIZED: Get engineers only with minimal data for dropdowns
        /// This endpoint is specifically optimized for performance when loading engineer lists
        /// </summary>
        [HttpGet]
        [RequirePermission("view_all_users")]
        public async Task<ActionResult<List<EngineerDto>>> GetEngineersOnly()
        {
            try
            {
                Console.WriteLine("[DEBUG] EngineersController: GetEngineersOnly called");
                var startTime = DateTime.UtcNow;
                
                var engineers = await _userService.GetEngineersOnlyAsync();
                
                var duration = DateTime.UtcNow - startTime;
                Console.WriteLine($"[DEBUG] EngineersController: Returned {engineers.Count} engineers in {duration.TotalMilliseconds}ms");
                
                return Ok(engineers);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] EngineersController: GetEngineersOnly failed: {ex.Message}");
                Console.WriteLine($"[ERROR] Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { message = "An error occurred while retrieving engineers", error = ex.Message });
            }
        }
    }
}