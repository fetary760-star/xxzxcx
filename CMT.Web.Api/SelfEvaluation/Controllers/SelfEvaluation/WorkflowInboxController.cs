using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.Models.SelfEvaluation;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    // =====================================================================================
    // WorkflowInboxController.cs   (NEW FILE)
    // Copy to: CMT.Web.Api.SelfEvaluation/Controllers/SelfEvaluation/WorkflowInboxController.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // The dashboard sidebar fetched GET /api/workflow/inbox?scope=all&pageSize=500 and got a
    // 404. Root cause (routing, not runtime logic):
    //
    //   - WorkflowFormsController is mapped at [Route("api/workflow")] but only declares the
    //     forms/... actions, so "inbox" matches no action;
    //   - WorkflowController (audit-logs, delegations) lives at the DIFFERENT prefix
    //     api/self-evaluation/workflow, so wiring the inbox there would change the reachable
    //     path to /api/self-evaluation/workflow/inbox and the frontend route table
    //     (workflow-api.ts: inbox: () => '/api/workflow/inbox') would STILL 404.
    //
    // This controller closes the gap WITHOUT touching either existing controller:
    //
    //     GET /api/workflow/inbox         -> WorkflowInboxQueryService.GetInboxAsync
    //     GET /api/workflow/inbox/counts  -> WorkflowInboxQueryService.GetCountsAsync
    //
    // The paths match WORKFLOW_ROUTES.inbox of the frontend route table exactly, so the
    // Next.js proxy (workflow-proxy.ts, rule 2: pass the status through unchanged) now
    // forwards a 200 instead of the upstream 404 and the sidebar renders the five
    // Assigned / Pending / Completed / Reviewed / Rejected counters per role.
    //
    // DI PREREQUISITE (Program.cs, next to WorkflowInstanceQueryService):
    //     builder.Services.AddScoped<WorkflowInboxQueryService>();
    // Without the registration ASP.NET cannot activate this controller and the routes
    // return 500, which the sidebar reports exactly like the original 404.
    //
    // BINDING RULES (identical to WorkflowInboxContracts.cs): user ids are long, entity ids
    // are Guid, and every enum is ALSO exposed as a string label.
    // =====================================================================================

    [ApiController]
    [Route("api/workflow")]
    [Authorize]
    public class WorkflowInboxController : ControllerBase
    {
        private readonly WorkflowInboxQueryService _inbox;
        private readonly ICurrentUserAccessor _currentUser;

        public WorkflowInboxController(
            WorkflowInboxQueryService inbox,
            ICurrentUserAccessor currentUser)
        {
            _inbox = inbox;
            _currentUser = currentUser;
        }

        /// <summary>
        /// GET /api/workflow/inbox?scope=all&amp;pageSize=500
        ///
        /// scope: "mine" (default) | "all" | "shop" — "all" is what the role sidebar uses.
        /// Returns WorkflowInboxItem rows: a SUPERSET of InboxItemResponse, so existing
        /// typed clients keep working while the sidebar additionally reads statusBucket,
        /// ownerRole, ataChapterCode / etaReference and partNumber.
        /// </summary>
        [HttpGet("inbox")]
        public async Task<IActionResult> GetInbox(
            [FromQuery] string? scope,
            [FromQuery] int pageSize = 100,
            CancellationToken cancellationToken = default)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var items = await _inbox.GetInboxAsync(user!, scope, pageSize, cancellationToken);
            return Ok(items);
        }

        /// <summary>
        /// GET /api/workflow/inbox/counts?scope=all
        ///
        /// Everything the role sidebar needs in ONE call: Totals, Mine ("My Requests"), and
        /// one WorkflowRoleCounts block per sidebar role (Director, Manager, Shop Team
        /// Leader, CAA Officer, QA Manager, Documentation) with the five counters each.
        /// </summary>
        [HttpGet("inbox/counts")]
        public async Task<IActionResult> GetInboxCounts(
            [FromQuery] string? scope,
            [FromQuery] int pageSize = 500,
            CancellationToken cancellationToken = default)
        {
            var (user, failure) = await RequireUserAsync(cancellationToken);
            if (failure is not null) return failure;

            var counts = await _inbox.GetCountsAsync(user!, scope, pageSize, cancellationToken);
            return Ok(counts);
        }

        private async Task<(User? user, IActionResult? failure)> RequireUserAsync(
            CancellationToken cancellationToken)
        {
            var user = await _currentUser.GetAsync(cancellationToken);
            if (user is null)
            {
                return (null, Unauthorized(new
                {
                    code = "NOT_AUTHENTICATED",
                    message = "The authenticated user could not be resolved."
                }));
            }
            return (user, null);
        }
    }
}