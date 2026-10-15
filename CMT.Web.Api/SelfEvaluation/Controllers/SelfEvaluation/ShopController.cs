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
    public class ShopController : ControllerBase
    {
        private readonly IMediator _mediator;

        public ShopController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var result = await _mediator.Send(new GetAllShopsQuery());
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetShopByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        [HttpGet("{id}/dashboard")]
        public async Task<IActionResult> GetDashboard(Guid id)
        {
            var result = await _mediator.Send(new GetShopDashboardSummaryQuery { ShopId = id });
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateShopCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateShopCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var result = await _mediator.Send(new DeleteShopCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }
    }
}