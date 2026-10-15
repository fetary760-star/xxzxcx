using System;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Contracts.Workflow;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;
using User = CMT.Domain.Models.SelfEvaluation.User;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    // =====================================================================================
    // WorkflowFormsController.cs  (RESTORED)
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // The frontend resolves the printed signature block of every controlled form through
    // `useFormWorkflowInstance.ts`, whose four-step chain depends on:
    //
    //     GET /api/workflow/forms/{instanceId}                 (STEP 1 + STEP 4)
    //     GET /api/workflow/forms?formSubmissionId={guid}      (STEP 2)
    //
    // When this controller was empty those routes 404-ed, `instance` stayed null, and the
    // signature layer fell back to the LEGACY scalar fields of FormSubmission
    // (ReviewedByUserId / ReviewedDate / ApprovedByUserId / ApprovedDate) which ARE
    // overwritten on every approval. That is exactly the reported "previous approver's
    // name / date / signature disappears after advancing stages" defect.
    //
    // This controller is the read path that fixes it: it returns the FULL materialised
    // chain (every executed step + every frozen signature line) via
    // WorkflowInstanceQueryService, so every completed approval stage stays visible.
    //
    // The action routes (submit / approve / reject / return / delegate) are restored too,
    // translated onto the existing catalog-driven submission handlers and answered with a
    // contract-correct WorkflowActionResponse re-read from the query service, so the typed
    // client (`workflow-api.ts`) is satisfied end to end.
    //
    // BINDING RULES (identical to the contracts): user ids are long, entity ids are Guid.
    // =====================================================================================
    [ApiController]
    [Route("api/workflow")]
    [Authorize]
    public class WorkflowFormsController : ControllerBase
    {
        private readonly WorkflowInstanceQueryService _query;
        private readonly IMediator _mediator;
        private readonly ICurrentUserAccessor _currentUser;
        private readonly ApplicationDbContext _context;

        public WorkflowFormsController(
            WorkflowInstanceQueryService query,
            IMediator mediator,
            ICurrentUserAccessor currentUser,
            ApplicationDbContext context)
        {
            _query = query;
            _mediator = mediator;
            _currentUser = currentUser;
            _context = context;
        }

        private async Task<(User? user, IActionResult? failure)> RequireUserAsync()
        {
            var user = await _currentUser.GetAsync(HttpContext.RequestAborted);
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

        // =================================================================================
        // READ  -  the routes the signature / instance resolution chain depends on
        // =================================================================================

        /// <summary>
        /// GET /api/workflow/forms/{instanceId}
        /// Also serves STEP 4 of the frontend chain, where the caller passes the
        /// FormSubmission id as the key: an instance-id miss is retried as a
        /// submission-id lookup before 404.
        /// </summary>
        [HttpGet("forms/{id:guid}")]
        public async Task<IActionResult> GetForm(Guid id)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var byInstance = await _query.GetByInstanceIdAsync(id, user!, HttpContext.RequestAborted);
            if (byInstance is not null) return Ok(byInstance);

            var bySubmission = await _query.GetByFormSubmissionIdAsync(id, user!, HttpContext.RequestAborted);
            if (bySubmission is not null) return Ok(bySubmission);

            return NotFound(new { code = WorkflowErrorCodes.InstanceNotFound, message = "Workflow instance not found." });
        }

        /// <summary>
        /// GET /api/workflow/forms?formSubmissionId={guid}
        /// STEP 2 of the frontend resolution chain.
        /// </summary>
        [HttpGet("forms")]
        public async Task<IActionResult> GetFormBySubmission([FromQuery] Guid? formSubmissionId)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            if (!formSubmissionId.HasValue)
                return BadRequest(new { code = "FORM_SUBMISSION_ID_REQUIRED", message = "formSubmissionId is required." });

            var instance = await _query.GetByFormSubmissionIdAsync(
                formSubmissionId.Value, user!, HttpContext.RequestAborted);

            if (instance is null)
                return NotFound(new { code = WorkflowErrorCodes.InstanceNotFound, message = "No workflow instance for that submission." });

            return Ok(instance);
        }

        // =================================================================================
        // ACTIONS  -  translated onto the existing catalog-driven submission handlers
        // =================================================================================

        /// <summary>POST /api/workflow/forms/{instanceId}/submit</summary>
        [HttpPost("forms/{instanceId:guid}/submit")]
        public async Task<IActionResult> Submit(Guid instanceId, [FromBody] SubmitFormRequest request)
        {
            return await RunActionAsync(instanceId, "Form submitted for approval.", async (user, submissionId) =>
                await _mediator.Send(new SubmitFormForApprovalCommand
                {
                    Id = submissionId,
                    SubmittedBy = user.FullName,
                    ActorUserId = user.Id
                }));
        }

        /// <summary>POST /api/workflow/forms/{instanceId}/assign</summary>
        [HttpPost("forms/{instanceId:guid}/assign")]
        public async Task<IActionResult> Assign(Guid instanceId, [FromBody] AssignStepRequest request)
        {
            if (request is null || request.AssignToUserId <= 0)
                return BadRequest(new { code = "ASSIGNEE_INVALID_ROLE", message = "A valid assignee is required." });

            return await RunActionAsync(instanceId, "Step assigned.", async (user, submissionId) =>
                await _mediator.Send(new AssignFormSubmissionCommand
                {
                    Id = submissionId,
                    StepNo = request.StepNo,
                    AssignToUserId = request.AssignToUserId,
                    Comments = request.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }));
        }

        /// <summary>
        /// Special Admin's Training Verification handoff: review Step 1 and assign Step 2
        /// to the selected respective Manager in one user action.
        /// </summary>
        [HttpPost("forms/{instanceId:guid}/review-and-assign")]
        public async Task<IActionResult> ReviewAndAssign(Guid instanceId, [FromBody] AssignStepRequest request)
        {
            if (request is null || request.AssignToUserId <= 0)
                return BadRequest(new { code = "ASSIGNEE_INVALID_ROLE", message = "A valid Manager is required." });

            return await RunActionAsync(instanceId, "Reviewed and assigned to Manager.", async (user, submissionId) =>
            {
                await using var transaction = await _context.Database.BeginTransactionAsync(HttpContext.RequestAborted);
                var approved = await _mediator.Send(new ApproveFormSubmissionCommand
                {
                    Id = submissionId,
                    ApprovedBy = user.FullName,
                    Comments = request.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }, HttpContext.RequestAborted);
                if (!approved)
                {
                    await transaction.RollbackAsync(HttpContext.RequestAborted);
                    return false;
                }

                var assigned = await _mediator.Send(new AssignFormSubmissionCommand
                {
                    Id = submissionId,
                    StepNo = 2,
                    AssignToUserId = request.AssignToUserId,
                    Comments = request.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }, HttpContext.RequestAborted);
                if (!assigned)
                {
                    await transaction.RollbackAsync(HttpContext.RequestAborted);
                    return false;
                }

                await transaction.CommitAsync(HttpContext.RequestAborted);
                return true;
            });
        }

        /// <summary>Manager approval plus assignment of the final HR Specialist step.</summary>
        [HttpPost("forms/{instanceId:guid}/approve-and-assign-manager")]
        public async Task<IActionResult> ApproveAndAssignManager(Guid instanceId, [FromBody] AssignStepRequest request)
        {
            if (request is null || request.AssignToUserId <= 0)
                return BadRequest(new { code = "ASSIGNEE_INVALID_ROLE", message = "A valid HR Specialist is required." });

            return await RunActionAsync(instanceId, "Approved and assigned for HR final approval.", async (user, submissionId) =>
            {
                await using var transaction = await _context.Database.BeginTransactionAsync(HttpContext.RequestAborted);
                var approved = await _mediator.Send(new ApproveFormSubmissionCommand
                {
                    Id = submissionId,
                    ApprovedBy = user.FullName,
                    Comments = request.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }, HttpContext.RequestAborted);
                if (!approved)
                {
                    await transaction.RollbackAsync(HttpContext.RequestAborted);
                    return false;
                }

                var assigned = await _mediator.Send(new AssignFormSubmissionCommand
                {
                    Id = submissionId,
                    StepNo = 3,
                    AssignToUserId = request.AssignToUserId,
                    Comments = request.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }, HttpContext.RequestAborted);
                if (!assigned)
                {
                    await transaction.RollbackAsync(HttpContext.RequestAborted);
                    return false;
                }

                await transaction.CommitAsync(HttpContext.RequestAborted);
                return true;
            });
        }

        /// <summary>POST /api/workflow/forms/{instanceId}/approve</summary>
        [HttpPost("forms/{instanceId:guid}/approve")]
        public async Task<IActionResult> Approve(Guid instanceId, [FromBody] DecisionRequest request)
        {
            return await RunActionAsync(instanceId, "Step approved.", async (user, submissionId) =>
                await _mediator.Send(new ApproveFormSubmissionCommand
                {
                    Id = submissionId,
                    ApprovedBy = user.FullName,
                    Comments = request?.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }));
        }

        /// <summary>POST /api/workflow/forms/{instanceId}/reject</summary>
        [HttpPost("forms/{instanceId:guid}/reject")]
        public async Task<IActionResult> Reject(Guid instanceId, [FromBody] DecisionRequest request)
        {
            return await RunActionAsync(instanceId, "Form rejected.", async (user, submissionId) =>
                await _mediator.Send(new RejectFormSubmissionCommand
                {
                    Id = submissionId,
                    RejectedBy = user.FullName,
                    Reason = request?.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }));
        }

        /// <summary>POST /api/workflow/forms/{instanceId}/return</summary>
        [HttpPost("forms/{instanceId:guid}/return")]
        public async Task<IActionResult> Return(Guid instanceId, [FromBody] DecisionRequest request)
        {
            return await RunActionAsync(instanceId, "Form returned for revision.", async (user, submissionId) =>
                await _mediator.Send(new ReturnFormForRevisionCommand
                {
                    Id = submissionId,
                    ReturnedBy = user.FullName,
                    Comments = request?.Comments ?? string.Empty,
                    ActorUserId = user.Id
                }));
        }

        /// <summary>POST /api/workflow/forms/{instanceId}/delegate</summary>
        [HttpPost("forms/{instanceId:guid}/delegate")]
        public async Task<IActionResult> Delegate(Guid instanceId, [FromBody] DelegateStepRequest request)
        {
            if (request is null || request.DelegateToUserId <= 0)
                return BadRequest(new { code = "ASSIGNEE_INVALID_ROLE", message = "A delegate user id is required." });

            return await RunActionAsync(instanceId, "Step delegated.", async (user, submissionId) =>
                await _mediator.Send(new DelegateFormSubmissionCommand
                {
                    Id = submissionId,
                    DelegateToUserId = request.DelegateToUserId,
                    DelegatedBy = user.FullName,
                    Reason = request.Reason ?? string.Empty,
                    ActorUserId = user.Id
                }));
        }

        // =================================================================================
        // ACTION PLUMBING
        // =================================================================================

        /// <summary>
        /// Resolves the instance -> its FormSubmission id, executes the underlying
        /// submission command, then re-reads the instance and answers with a
        /// WorkflowActionResponse built from the fresh state. AuthorizationDeniedException
        /// thrown by the handlers is translated to 403 by the global middleware.
        /// </summary>
        private async Task<IActionResult> RunActionAsync(
            Guid instanceId,
            string successMessage,
            Func<User, Guid, Task<bool>> execute)
        {
            var (user, failure) = await RequireUserAsync();
            if (failure is not null) return failure;

            var before = await _query.GetByInstanceIdAsync(instanceId, user!, HttpContext.RequestAborted);
            if (before is null)
                return NotFound(new { code = WorkflowErrorCodes.InstanceNotFound, message = "Workflow instance not found." });

            if (!before.FormSubmissionId.HasValue)
                return BadRequest(new { code = "FORM_SUBMISSION_MISSING", message = "This instance is not linked to a form submission." });

            var ok = await execute(user!, before.FormSubmissionId.Value);
            if (!ok)
                return BadRequest(new { code = "STEP_NOT_ACTIVE", message = "The action could not be applied at the current step." });

            var after = await _query.GetByInstanceIdAsync(instanceId, user!, HttpContext.RequestAborted) ?? before;
            return Ok(BuildActionResponse(after, successMessage));
        }

        private static WorkflowActionResponse BuildActionResponse(WorkflowInstanceResponse i, string message)
        {
            var active = i.Steps.FirstOrDefault(s =>
                s.State == WorkflowStepState.Active || s.State == WorkflowStepState.AwaitingAssignment);

            return new WorkflowActionResponse
            {
                Success = true,
                Message = message,
                InstanceId = i.Id,
                Status = i.Status,
                StatusLabel = i.StatusLabel,
                LifecycleState = i.LifecycleState,
                CurrentStepNo = i.CurrentStepNo,
                CurrentStepTitle = active?.Title ?? string.Empty,
                CurrentAssigneeUserId = i.CurrentAssigneeUserId,
                CurrentAssigneeName = i.CurrentAssigneeName,
                IsComplete = i.IsComplete,
                IsLocked = i.IsLocked
            };
        }
    }
}