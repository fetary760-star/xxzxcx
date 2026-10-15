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
    public class WorkflowController : ControllerBase
    {
        private readonly IMediator _mediator;

        public WorkflowController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("audit-logs/entity/{entityType}/{entityId}")]
        // Backward-compatible alias for frontend bundles deployed before the `/entity/`
        // route segment was added.
        [HttpGet("audit-logs/{entityType}/{entityId}")]
        public async Task<IActionResult> GetLogsByEntity(string entityType, Guid entityId)
        {
            var result = await _mediator.Send(new GetWorkflowAuditLogsByEntityQuery
            {
                EntityType = entityType,
                EntityId = entityId
            });
            return Ok(result);
        }

        [HttpGet("audit-logs/recent")]
        public async Task<IActionResult> GetRecentLogs([FromQuery] int count = 50)
        {
            var result = await _mediator.Send(new GetRecentWorkflowAuditLogsQuery { Count = count });
            return Ok(result);
        }

        [HttpPost("audit-logs")]
        public async Task<IActionResult> CreateLog([FromBody] CreateWorkflowAuditLogCommand command)
        {
            command.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        // Responsibility Delegations
        [HttpGet("delegations/shop/{shopId}")]
        public async Task<IActionResult> GetDelegationsByShop(Guid shopId)
        {
            var result = await _mediator.Send(new GetDelegationsByShopQuery { ShopId = shopId });
            return Ok(result);
        }

        [HttpPost("delegations")]
        public async Task<IActionResult> CreateDelegation([FromBody] CreateResponsibilityDelegationCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return Ok(new { id });
        }

        [HttpPut("delegations/{id}")]
        public async Task<IActionResult> UpdateDelegation(Guid id, [FromBody] UpdateResponsibilityDelegationCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }
    }
}