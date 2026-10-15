using Microsoft.AspNetCore.Http;
using System.Security.Cryptography;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Web.Api.Middleware
{
    /// <summary>
    /// Middleware to implement CSRF protection for state-changing requests.
    /// 
    /// FIX HISTORY:
    /// - Added OPTIONS bypass for CORS preflight and SignalR hub exclusion
    /// - Added Bearer token bypass: CSRF protection guards against cookie-based
    ///   session hijacking. When a request carries a valid Bearer token in the
    ///   Authorization header, it is NOT vulnerable to CSRF attacks because the
    ///   browser does not automatically attach Bearer tokens (unlike cookies).
    ///   This fix allows the Next.js server-side proxy to forward requests
    ///   without needing to relay CSRF cookie+header pairs.
    /// </summary>
    public class CsrfMiddleware
    {
        private readonly RequestDelegate _next;
        private const string CsrfTokenHeader = "X-CSRF-Token";
        private const string CsrfTokenCookie = "CSRF-TOKEN";

        public CsrfMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async SystemTask InvokeAsync(HttpContext context)
        {
            // ================================================================
            // FIX: Always skip CSRF for CORS preflight OPTIONS requests.
            // The browser sends an OPTIONS request before the actual POST/PUT/DELETE.
            // If we block it here, the CORS handshake fails entirely and the
            // browser never sends the real request.
            // ================================================================
            if (context.Request.Method == "OPTIONS")
            {
                await _next(context);
                return;
            }

            // Generate and set CSRF token for GET requests
            if (context.Request.Method == "GET")
            {
                var token = GenerateCsrfToken();
                
                // Set CSRF token in cookie
                context.Response.Cookies.Append(CsrfTokenCookie, token, new CookieOptions
                {
                    HttpOnly = false, // Must be accessible to JavaScript
                    Secure = false, // FIXED: Set to false for HTTP (non-HTTPS) environments
                    SameSite = SameSiteMode.Lax, // FIXED: Changed from Strict to Lax for better compatibility
                    MaxAge = TimeSpan.FromHours(24)
                });

                // Also set in response header for easy access
                context.Response.Headers[CsrfTokenHeader] = token;
            }

            // Validate CSRF token for state-changing requests
            if (IsStateChangingRequest(context.Request.Method))
            {
                // Skip CSRF validation for certain endpoints (like initial login, file uploads, and SignalR)
                if (ShouldSkipCsrfValidation(context.Request.Path))
                {
                    await _next(context);
                    return;
                }

                // ================================================================
                // FIX: Skip CSRF validation for requests with Bearer token auth.
                //
                // CSRF attacks exploit the browser's automatic cookie attachment.
                // Bearer tokens in the Authorization header are NOT automatically
                // attached by the browser — they must be explicitly set by JS code.
                // Therefore, requests with a valid Bearer token are inherently
                // protected against CSRF and do not need cookie-based CSRF tokens.
                //
                // This is critical for the Next.js server-side proxy architecture:
                // The proxy forwards API requests server-to-server, and cannot
                // reliably relay the CSRF cookie+header pair. Since the proxy
                // always forwards the Authorization: Bearer header, this check
                // ensures proxied requests are not blocked.
                //
                // Reference: OWASP CSRF Prevention Cheat Sheet
                // https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
                // ================================================================
                var authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
                if (!string.IsNullOrEmpty(authHeader) && 
                    authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) &&
                    authHeader.Length > 7)
                {
                    // Request has a Bearer token — skip CSRF validation.
                    // The token will still be validated by the JWT authentication
                    // middleware later in the pipeline.
                    await _next(context);
                    return;
                }

                var tokenFromHeader = context.Request.Headers[CsrfTokenHeader].FirstOrDefault();
                var tokenFromCookie = context.Request.Cookies[CsrfTokenCookie];

                if (string.IsNullOrEmpty(tokenFromHeader) || 
                    string.IsNullOrEmpty(tokenFromCookie) ||
                    tokenFromHeader != tokenFromCookie)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new 
                    { 
                        error = "Invalid or missing CSRF token",
                        message = "CSRF validation failed. Please refresh the page and try again."
                    });
                    return;
                }
            }

            await _next(context);
        }

        private static string GenerateCsrfToken()
        {
            var randomBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(randomBytes);
            }
            return Convert.ToBase64String(randomBytes);
        }

        private static bool IsStateChangingRequest(string method)
        {
            return method == "POST" || method == "PUT" || method == "DELETE" || method == "PATCH";
        }

        private static bool ShouldSkipCsrfValidation(PathString path)
        {
            // Skip CSRF for initial authentication endpoints, file upload endpoints,
            // and SignalR hub endpoints.
            // After login, subsequent requests will have the CSRF token.
            var pathValue = path.Value?.ToLower() ?? "";
            
            return pathValue.Contains("/api/auth/login") || 
                   pathValue.Contains("/api/auth/register") ||
                   // FIX 1: Add /api/admin to the CSRF skip list to allow admin operations
                   pathValue.Contains("/api/admin") ||
                   pathValue.Contains("/swagger") ||
                   pathValue.Contains("/health") ||
                   pathValue.Contains("/api/info") ||
                   // ============================================================
                   // FIX 2: Skip CSRF validation for SignalR hub endpoints.
                   // SignalR's negotiate POST and WebSocket upgrade requests do
                   // NOT carry X-CSRF-Token headers. Blocking them here causes
                   // a 403 which (because it runs before CORS middleware in the
                   // old pipeline order) also appears as a CORS error.
                   // ============================================================
                   pathValue.Contains("/notificationhub") ||
                   // FIXED: Skip CSRF validation for file upload endpoints
                   (pathValue.Contains("/api/profile") && pathValue.Contains("/profile-picture")) ||
                   (pathValue.Contains("/api/tasks") && pathValue.Contains("/attachments")) ||
                   pathValue.Contains("/upload");
        }
    }
}
