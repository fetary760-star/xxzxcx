using Microsoft.AspNetCore.Http;
using System;
using System.Security.Cryptography;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Web.Api.Middleware
{
    /// <summary>
    /// Middleware to add security headers to all HTTP responses
    /// Implements CSP, X-Frame-Options, and other security best practices
    /// FIX: Added OPTIONS preflight bypass so CORS headers aren't overwritten
    /// SECURITY FIX (CSP Hardening):
    ///   - Removed 'unsafe-inline' and 'unsafe-eval' from script-src
    ///   - Removed 'unsafe-inline' from style-src
    ///   - Added per-request cryptographically random nonce for script-src and style-src
    ///   - Added object-src 'none', base-uri 'self', form-action 'self' (strict CSP baseline)
    /// The generated nonce is stored in HttpContext.Items["CSP-Nonce"] so that views / Razor
    /// pages can render it onto any inline &lt;script&gt; or &lt;style&gt; elements via
    /// nonce="@Context.Items["CSP-Nonce"]".
    /// </summary>
    public class SecurityHeadersMiddleware
    {
        private readonly RequestDelegate _next;

        /// <summary>
        /// Key used to expose the per-request CSP nonce via HttpContext.Items.
        /// </summary>
        public const string CspNonceItemKey = "CSP-Nonce";

        // List of sensitive/admin paths that require extra protection
        private static readonly string[] SensitivePaths = new[]
        {
            "/dashboard",
            "/admin",
            "/settings",
            "/users",
            "/profile",
            "/reports",
            "/analytics",
            "/performance",
            "/schedule",
            "/workload",
            "/notifications",
            "/amendments",
            "/tasks"
        };

        public SecurityHeadersMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async SystemTask InvokeAsync(HttpContext context)
        {
            // ================================================================
            // FIX: Don't add restrictive security headers to CORS preflight
            // responses. The browser's OPTIONS request must receive clean CORS
            // headers from the UseCors middleware. Adding CSP, X-Frame-Options,
            // etc. to preflight responses can interfere with the CORS handshake.
            // ================================================================
            if (context.Request.Method == "OPTIONS")
            {
                await _next(context);
                return;
            }

            // GLOBAL FRAME PROTECTION - Applied to ALL responses
            context.Response.Headers["X-Frame-Options"] = "DENY";

            // Check if this is a sensitive/admin path for additional logging
            var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";
            var isSensitivePath = IsSensitivePath(path);

            // ----------------------------------------------------------------
            // SECURITY FIX: Generate a cryptographically random nonce per
            // request and expose it via HttpContext.Items so that any server
            // rendered inline <script> / <style> tag can consume it. This
            // replaces the previous unsafe-inline / unsafe-eval allowances.
            // ----------------------------------------------------------------
            var nonce = GenerateCspNonce();
            context.Items[CspNonceItemKey] = nonce;

            // Content Security Policy (CSP) with frame-ancestors 'none'
            var cspValue = isSensitivePath
                ? BuildStrictCsp(nonce)
                : BuildStandardCsp(nonce);

            context.Response.Headers["Content-Security-Policy"] = cspValue;

            // X-Content-Type-Options: Prevent MIME-sniffing
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";

            // Referrer-Policy: Control referrer information
            context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

            // Permissions-Policy: Control browser features
            context.Response.Headers["Permissions-Policy"] =
                "geolocation=(), microphone=(), camera=(), payment=(), usb=()";

            // X-XSS-Protection: Enable browser XSS protection (legacy support)
            context.Response.Headers["X-XSS-Protection"] = "1; mode=block";

            // ----------------------------------------------------------------
            // SECURITY FIX (HSTS - HTTP Strict Transport Security):
            // Instruct browsers to only communicate with this origin over HTTPS
            // for the next 1 year, including all subdomains, and allow preload
            // list submission. Per RFC 6797, HSTS MUST only be emitted over a
            // secure (HTTPS) connection; sending it over plain HTTP has no
            // effect and browsers will ignore it. We therefore only set this
            // header when the request is served over HTTPS.
            // ----------------------------------------------------------------
            if (context.Request.IsHttps)
            {
                context.Response.Headers["Strict-Transport-Security"] =
                    "max-age=31536000; includeSubDomains; preload";
            }

            // Cache-Control for sensitive paths
            if (isSensitivePath)
            {
                context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private";
                context.Response.Headers["Pragma"] = "no-cache";
                context.Response.Headers["Expires"] = "0";
            }

            await _next(context);
        }

        /// <summary>
        /// Generate a cryptographically secure, Base64 encoded nonce (128 bits of entropy).
        /// </summary>
        private static string GenerateCspNonce()
        {
            var bytes = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            return Convert.ToBase64String(bytes);
        }

        /// <summary>
        /// Check if the request path is a sensitive/admin path
        /// </summary>
        private bool IsSensitivePath(string path)
        {
            foreach (var sensitivePath in SensitivePaths)
            {
                if (path.StartsWith(sensitivePath, StringComparison.OrdinalIgnoreCase) ||
                    path.Contains(sensitivePath, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// Build standard CSP for general pages (HTTP-compatible).
        /// SECURITY FIX: Replaces 'unsafe-inline' / 'unsafe-eval' with a per-request nonce.
        /// </summary>
        private string BuildStandardCsp(string nonce)
        {
            return "default-src 'self' blob: data:; " +
                   $"script-src 'self' 'nonce-{nonce}'; " +
                   $"style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com; " +
                   "font-src 'self' https://fonts.gstatic.com data:; " +
                   "img-src 'self' data: https: http: blob:; " +
                   "media-src 'self' blob: data:; " +
                   "connect-src 'self' http://localhost:5000 http://svhqiis03:8757 wss://svhqiis03:8756 ws://svhqiis03:8756 wss: ws: http: blob:; " +
                   "frame-ancestors 'none'; " +
                   "base-uri 'self'; " +
                   "form-action 'self'; " +
                   "object-src 'none'";
        }

        /// <summary>
        /// Build strict CSP for sensitive/admin pages (HTTP-compatible).
        /// SECURITY FIX: Replaces 'unsafe-inline' / 'unsafe-eval' with a per-request nonce.
        /// </summary>
        private string BuildStrictCsp(string nonce)
        {
            return "default-src 'self' blob: data:; " +
                   $"script-src 'self' 'nonce-{nonce}'; " +
                   $"style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com; " +
                   "font-src 'self' https://fonts.gstatic.com data:; " +
                   "img-src 'self' data: https: http: blob:; " +
                   "media-src 'self' blob: data:; " +
                   "connect-src 'self' http://localhost:5000 http://svhqiis03:8757 wss://svhqiis03:8756 ws://svhqiis03:8756 wss: ws: http: blob:; " +
                   "frame-ancestors 'none'; " +
                   "base-uri 'self'; " +
                   "form-action 'self'; " +
                   "object-src 'none'";
        }
    }

    /// <summary>
    /// Extension method to easily add SecurityHeadersMiddleware to the pipeline
    /// </summary>
    public static class SecurityHeadersMiddlewareExtensions
    {
        public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<SecurityHeadersMiddleware>();
        }
    }
}
