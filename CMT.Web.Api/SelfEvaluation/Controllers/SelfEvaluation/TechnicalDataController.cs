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
    public class TechnicalDataController : ControllerBase
    {
        private readonly IMediator _mediator;

        public TechnicalDataController(IMediator mediator)
        {
            _mediator = mediator;
        }

        // Airworthiness Directives
        [HttpGet("airworthiness-directives/component/{componentId}")]
        public async Task<IActionResult> GetADsByComponent(Guid componentId)
        {
            var result = await _mediator.Send(new GetAirworthinessDirectivesByComponentQuery { ComponentId = componentId });
            return Ok(result);
        }

        [HttpPost("airworthiness-directives")]
        public async Task<IActionResult> CreateAD([FromBody] CreateAirworthinessDirectiveCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("airworthiness-directives/{id}")]
        public async Task<IActionResult> UpdateAD(Guid id, [FromBody] UpdateAirworthinessDirectiveCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }

        // Service Bulletins
        [HttpGet("service-bulletins/component/{componentId}")]
        public async Task<IActionResult> GetSBsByComponent(Guid componentId)
        {
            var result = await _mediator.Send(new GetServiceBulletinsByComponentQuery { ComponentId = componentId });
            return Ok(result);
        }

        [HttpPost("service-bulletins")]
        public async Task<IActionResult> CreateSB([FromBody] CreateServiceBulletinCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("service-bulletins/{id}")]
        public async Task<IActionResult> UpdateSB(Guid id, [FromBody] UpdateServiceBulletinCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }

        // Tool Needs Analysis
        [HttpGet("tools/shop/{shopId}")]
        public async Task<IActionResult> GetToolsByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetToolNeedsAnalysisByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpPost("tools")]
        public async Task<IActionResult> CreateTool([FromBody] CreateToolNeedsAnalysisCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("tools/{id}")]
        public async Task<IActionResult> UpdateTool(Guid id, [FromBody] UpdateToolNeedsAnalysisCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }
    }
}