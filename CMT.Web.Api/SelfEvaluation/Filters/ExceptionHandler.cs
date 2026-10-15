using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CMT.Web.Api.SelfEvaluation.Filters;

public class ExceptionHandler : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        context.Result = new ObjectResult(new { Error = context.Exception.Message })
        {
            StatusCode = 500
        };
        context.ExceptionHandled = true;
    }
}
