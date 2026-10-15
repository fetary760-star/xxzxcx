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
    public class SelfAuditController : ControllerBase
    {
        private readonly IMediator _mediator;

        public SelfAuditController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetSelfAuditChecklistByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpGet("shop/{shopId}/status/{status}")]
        public async Task<IActionResult> GetByStatus(Guid shopId, AuditStatus status)
        {
            var result = await _mediator.Send(new GetSelfAuditChecklistByStatusQuery
            {
                ShopId = shopId,
                Status = status
            });
            return Ok(result);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateSelfAuditChecklistCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSelfAuditChecklistCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }
    }
}