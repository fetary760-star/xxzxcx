using CMT.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System.Threading.Tasks;

namespace CMT.Web.Api.Attributes
{
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class RequirePermissionAttribute : Attribute, IAsyncAuthorizationFilter
    {
        private readonly string _permission;

        public RequirePermissionAttribute(string permission)
        {
            _permission = permission;
        }

        public async System.Threading.Tasks.Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var authorizationService = context.HttpContext.RequestServices
                .GetRequiredService<CMT.Application.Interfaces.IAuthorizationService>();

            if (!context.HttpContext.User.Identity?.IsAuthenticated ?? true)
            {
                Console.WriteLine($"[RequirePermission] Authentication required for permission: {_permission}");
                context.Result = new UnauthorizedObjectResult(new { 
                    error = "unauthorized", 
                    message = "Authentication required" 
                });
                return;
            }

            try
            {
                var hasPermission = await authorizationService.HasPermissionAsync(
                    context.HttpContext.User, _permission);

                if (!hasPermission)
                {
                    // Get user info for debugging
                    var userIdClaim = context.HttpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
                    var userId = userIdClaim?.Value ?? "unknown";
                    
                    Console.WriteLine($"[RequirePermission] Permission '{_permission}' denied for user: {userId}");
                    
                    context.Result = new ObjectResult(new { 
                        error = "unauthorized", 
                        message = "requireRole failed" 
                    })
                    {
                        StatusCode = 401 // Changed from 403 to 401 to match frontend expectations
                    };
                }
                else
                {
                    Console.WriteLine($"[RequirePermission] Permission '{_permission}' granted");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RequirePermission] Error checking permission '{_permission}': {ex.Message}");
                context.Result = new ObjectResult(new { 
                    error = "unauthorized", 
                    message = "requireRole failed" 
                })
                {
                    StatusCode = 401
                };
            }
        }
    }
}