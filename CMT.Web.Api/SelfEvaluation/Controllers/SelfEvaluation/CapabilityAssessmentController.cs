using System;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;
using CMT.Domain.Models.Shared;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    [ApiController]
    [Route("api/self-evaluation/[controller]")]
    [Authorize]
    public class CapabilityAssessmentController : ControllerBase
    {
        private readonly IMediator _mediator;

        public CapabilityAssessmentController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetCapabilityAssessmentsByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetCapabilityAssessmentByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        [HttpGet("shop/{shopId}/status/{status}")]
        public async Task<IActionResult> GetByStatus(Guid shopId, CapabilityStatus status)
        {
            var result = await _mediator.Send(new GetCapabilityAssessmentsByStatusQuery
            {
                ShopId = shopId,
                Status = status
            });
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateCapabilityAssessmentCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCapabilityAssessmentCommand command)
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
            var result = await _mediator.Send(new DeleteCapabilityAssessmentCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }
    }
}