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
    public class ComponentController : ControllerBase
    {
        private readonly IMediator _mediator;

        public ComponentController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetComponentsByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetComponentByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        [HttpGet("ata-chapter/{ataChapterId}")]
        public async Task<IActionResult> GetByATAChapter(Guid ataChapterId)
        {
            var result = await _mediator.Send(new GetComponentsByATAChapterQuery { ATAChapterId = ataChapterId });
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateComponentCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateComponentCommand command)
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
            var result = await _mediator.Send(new DeleteComponentCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }
    }
}