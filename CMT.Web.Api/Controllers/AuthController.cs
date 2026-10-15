using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly CMT.Application.Interfaces.IAuthorizationService _authorizationService;
        private readonly IWebHostEnvironment _env;

        public AuthController(
            IUserService userService,
            CMT.Application.Interfaces.IAuthorizationService authorizationService,
            IWebHostEnvironment env)
        {
            _userService = userService;
            _authorizationService = authorizationService;
            _env = env;
        }

        [HttpPost("login")]
        public async Task<ActionResult<LoginResponseDto>> Login([FromBody] LoginDto loginDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                var result = await _userService.AuthenticateAsync(loginDto);
                if (result == null)
                {
                    // Return Ok with a null result or an error flag instead of Unauthorized
                    return Ok(new { success = false, message = "Invalid username or password. Please try again." });
                }

                // SECURITY FIX (Finding 12): Set the JWT and refresh token as HttpOnly
                // cookies on login so the frontend never has to store them in
                // localStorage. The frontend keeps an in-memory Bearer fallback only.
                SetSecureAuthCookies(result.Token, result.RefreshToken);

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred during login", error = ex.Message });
            }
        }

        [HttpPost("refresh")]
        public async Task<ActionResult<LoginResponseDto>> RefreshToken([FromBody] RefreshTokenDto refreshTokenDto)
        {
            try
            {
                if (!ModelState.IsValid)
                    return BadRequest(ModelState);

                // Prefer the refresh token from the HttpOnly cookie; fall back to
                // the body only if the cookie is not present (e.g. first-time
                // clients that still post it explicitly).
                var refreshToken = Request.Cookies["refresh_token"];
                if (string.IsNullOrEmpty(refreshToken))
                {
                    refreshToken = refreshTokenDto?.RefreshToken ?? "";
                }

                var result = await _userService.RefreshTokenAsync(refreshToken);
                if (result == null)
                    return Unauthorized(new { message = "Invalid refresh token" });

                // Rotate the HttpOnly cookies with the new tokens.
                SetSecureAuthCookies(result.Token, result.RefreshToken);

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred during token refresh", error = ex.Message });
            }
        }

        [HttpPost("logout")]
        [Authorize]
        public async Task<ActionResult> Logout()
        {
            try
            {
                // Prefer the cookie as the source of truth for the access token
                // on logout; fall back to the Authorization header for clients
                // that still use Bearer.
                var token = Request.Cookies["access_token"];
                if (string.IsNullOrEmpty(token))
                {
                    token = Request.Headers.Authorization.ToString().Replace("Bearer ", "");
                }

                if (!string.IsNullOrEmpty(token))
                {
                    await _userService.RevokeTokenAsync(token);
                }

                // SECURITY FIX (Finding 12): Always clear the HttpOnly auth cookies
                // on logout so a compromised browser cannot keep using them.
                ClearAuthCookies();

                return Ok(new { message = "Logged out successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred during logout", error = ex.Message });
            }
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<ActionResult<UserDto>> GetCurrentUser()
        {
            try
            {
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
                    return Unauthorized();

                var user = await _userService.GetUserByIdAsync(userId);
                if (user == null)
                    return NotFound(new { message = "User not found" });

                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving user information", error = ex.Message });
            }
        }

        [HttpGet("permissions")]
        [Authorize]
        public async Task<ActionResult<List<string>>> GetCurrentUserPermissions()
        {
            try
            {
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
                    return Unauthorized();

                var permissions = await _authorizationService.GetUserPermissionsAsync(userId);
                return Ok(permissions);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving permissions", error = ex.Message });
            }
        }

        // ====================================================================
        // SECURITY FIX (Finding 12 — Sensitive Data Exposure via Browser Local Storage)
        //
        // Sets / clears the JWT access token and refresh token as HttpOnly,
        // SameSite=Strict cookies. The Secure flag is enabled automatically when
        // the server is running outside of Development (production/staging over
        // HTTPS). In Development we keep Secure=false so it still works over
        // plain HTTP on localhost.
        // ====================================================================

        private void SetSecureAuthCookies(string accessToken, string refreshToken)
        {
            var secure = !_env.IsDevelopment();

            // SameSite = Lax (not Strict): Strict withholds the auth cookie on
            // top-level navigations from ANY external origin (email links,
            // bookmarks opened from other apps, OAuth redirects), which caused
            // spurious "logged out on refresh" symptoms. Lax still blocks CSRF
            // on state-changing requests (POST/PUT/DELETE) because the browser
            // only sends the cookie on safe top-level GET navigation.
            var accessCookieOptions = new CookieOptions
            {
                HttpOnly = true,                        // Not reachable from JavaScript -> XSS-safe
                Secure = secure,                        // HTTPS only in non-dev environments
                SameSite = SameSiteMode.Lax,            // CSRF-safe for GET; survives external reloads
                IsEssential = true,                     // Required for authentication
                Path = "/",
                Expires = DateTimeOffset.UtcNow.AddHours(24)
            };

            var refreshCookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = secure,
                SameSite = SameSiteMode.Lax,
                IsEssential = true,
                Path = "/",
                Expires = DateTimeOffset.UtcNow.AddDays(30)
            };

            Response.Cookies.Append("access_token", accessToken, accessCookieOptions);
            Response.Cookies.Append("refresh_token", refreshToken, refreshCookieOptions);
        }

        private void ClearAuthCookies()
        {
            var secure = !_env.IsDevelopment();

            var expiredOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = secure,
                SameSite = SameSiteMode.Lax,
                Path = "/",
                Expires = DateTimeOffset.UtcNow.AddDays(-1)  // Expire immediately
            };

            Response.Cookies.Delete("access_token", expiredOptions);
            Response.Cookies.Delete("refresh_token", expiredOptions);
        }
    }
}