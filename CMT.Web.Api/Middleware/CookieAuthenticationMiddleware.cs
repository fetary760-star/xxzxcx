using Microsoft.AspNetCore.Http;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Web.Api.Middleware
{
    /// <summary>
    /// Middleware to handle secure cookie-based authentication
    /// Sets HttpOnly and appropriate security flags on authentication cookies
    /// FIXED: Updated for HTTP-only deployment (server doesn't have HTTPS configured)
    /// </summary>
    public class CookieAuthenticationMiddleware
    {
        private readonly RequestDelegate _next;

        public CookieAuthenticationMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async SystemTask InvokeAsync(HttpContext context)
        {
            // Intercept the response to set secure cookie options
            context.Response.OnStarting(() =>
            {
                // Set cookie options appropriate for HTTP deployment
                // FIXED: Set Secure = false since server doesn't have HTTPS configured
                // Setting Secure = true on HTTP would prevent cookies from being sent
                var cookieOptions = new CookieOptions
                {
                    HttpOnly = true,           // Prevents JavaScript access (XSS protection)
                    Secure = false,            // FIXED: Set to false for HTTP (non-HTTPS) environments
                    SameSite = SameSiteMode.Lax,  // FIXED: Changed from Strict to Lax for better compatibility
                    IsEssential = true         // Required for authentication
                };

                // Apply to authentication-related cookies
                if (context.Request.Cookies.ContainsKey("access_token"))
                {
                    var token = context.Request.Cookies["access_token"];
                    context.Response.Cookies.Append("access_token", token ?? "", cookieOptions);
                }

                if (context.Request.Cookies.ContainsKey("refresh_token"))
                {
                    var token = context.Request.Cookies["refresh_token"];
                    context.Response.Cookies.Append("refresh_token", token ?? "", cookieOptions);
                }

                return SystemTask.CompletedTask;
            });

            await _next(context);
        }
    }
}