using Microsoft.AspNetCore.Mvc.Filters;

namespace CMT.Web.Api.SelfEvaluation.Filters;

public class AuthorizationHandler : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context) { }
    public void OnActionExecuted(ActionExecutedContext context) { }
}
