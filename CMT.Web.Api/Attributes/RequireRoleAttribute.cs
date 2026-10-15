using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using System.Threading.Tasks;

namespace CMT.Web.Api.Attributes
{
    public class RequireRoleAttribute : Attribute, IAsyncAuthorizationFilter
    {
        private readonly CMT.Application.DTOs.UserRole _requiredRole;

        public RequireRoleAttribute(CMT.Application.DTOs.UserRole requiredRole)
        {
            _requiredRole = requiredRole;
        }

        public async System.Threading.Tasks.Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var authorizationService = context.HttpContext.RequestServices
                .GetRequiredService<CMT.Application.Interfaces.IAuthorizationService>();

            var user = context.HttpContext.User;
            if (!user.Identity?.IsAuthenticated ?? true)
            {
                context.Result = new UnauthorizedResult();
                return;
            }

            var hasRole = await authorizationService.HasRoleAsync(user, _requiredRole);
            if (!hasRole)
            {
                context.Result = new ForbidResult();
            }
        }
    }
}