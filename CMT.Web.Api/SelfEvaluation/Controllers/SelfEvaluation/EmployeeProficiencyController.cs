using System;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    [ApiController]
    [Route("api/self-evaluation/[controller]")]
    [Authorize]
    public class EmployeeProficiencyController : ControllerBase
    {
        private readonly IMediator _mediator;

        public EmployeeProficiencyController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetEmployeeProficiencyByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateEmployeeProficiencyRecordCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEmployeeProficiencyRecordCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }
    }
}