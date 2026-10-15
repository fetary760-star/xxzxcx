using Microsoft.AspNetCore.Mvc;
using MediatR;

namespace CMT.Web.Api.Controllers;

public abstract class BaseController : ControllerBase
{
    protected readonly IMediator _mediator;

    protected BaseController(IMediator mediator)
    {
        _mediator = mediator;
    }

    protected IActionResult HandleResult<T>(T result)
    {
        if (result == null)
        {
            return NotFound(new
            {
                success = false,
                message = new[] { new { code = "NOT_FOUND", message = "Resource not found" } }
            });
        }

        return Ok(new
        {
            success = true,
            data = result
        });
    }
}