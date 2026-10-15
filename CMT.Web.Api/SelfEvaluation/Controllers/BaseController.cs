using MediatR;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Model;
using Error = CMT.Application.SelfEvaluation.Model.Error;
using ErrorCode = CMT.Application.SelfEvaluation.Model.ErrorCode;

namespace CMT.Web.Api.SelfEvaluation.Controllers;

[ApiController]
public abstract class BaseController : ControllerBase
{
    protected IMediator _mediator => HttpContext.RequestServices.GetRequiredService<IMediator>();

    protected IActionResult HandleErrorResponse(List<Error> errors)
    {
        if (errors.Any(e => e.Code == ErrorCode.NotFound))
            return NotFound(new { Errors = errors.Select(e => e.Message) });

        if (errors.Any(e => e.Code == ErrorCode.ValidationError))
            return BadRequest(new { Errors = errors.Select(e => e.Message) });

        if (errors.Any(e => e.Code == ErrorCode.UnAuthorized))
            return Unauthorized(new { Errors = errors.Select(e => e.Message) });

        if (errors.Any(e => e.Code == ErrorCode.RecordFound))
            return Conflict(new { Errors = errors.Select(e => e.Message) });

        return StatusCode(500, new { Errors = errors.Select(e => e.Message) });
    }
}
