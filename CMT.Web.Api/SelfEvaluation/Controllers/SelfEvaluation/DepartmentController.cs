using System;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Queries.SelfEvaluation;

namespace CMT.Web.Api.SelfEvaluation.Controllers.SelfEvaluation
{
    /// <summary>
    /// DepartmentController - AMENDED (Single Source of Truth)
    /// 
    /// This is the ONLY DepartmentController in the project.
    /// The duplicate in Controllers/DepartmentController.cs has been REMOVED
    /// to fix AmbiguousMatchException.
    /// 
    /// Manages organizational departments (CMT, ACS, MCS, NDT, Standard, etc.)
    /// Departments are overseen by Directors and contain Managers for sub-areas.
    /// 
    /// Role Hierarchy:
    /// - Admin: Can create/edit/delete any department
    /// - Director: Can view and edit their assigned department
    /// - Manager: Can view their department
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/departments")]
    [Authorize]
    public class DepartmentController : ControllerBase
    {
        private readonly IMediator _mediator;

        public DepartmentController(IMediator mediator)
        {
            _mediator = mediator;
        }

        /// <summary>
        /// Get all departments.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var result = await _mediator.Send(new GetAllDepartmentsQuery());
            return Ok(result);
        }

        /// <summary>
        /// Get department hierarchy (root departments with sub-departments and shops).
        /// </summary>
        [HttpGet("hierarchy")]
        public async Task<IActionResult> GetHierarchy()
        {
            var result = await _mediator.Send(new GetDepartmentHierarchyQuery());
            return Ok(result);
        }

        /// <summary>
        /// Get a specific department by ID with sub-departments and shops.
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _mediator.Send(new GetDepartmentByIdQuery { Id = id });
            if (result == null) return NotFound();
            return Ok(result);
        }

        /// <summary>
        /// Create a new department.
        /// Only Admin and Director roles can create departments.
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateDepartmentCommand command)
        {
            command.CreatedBy = User.Identity?.Name ?? "system";
            var id = await _mediator.Send(command);
            return CreatedAtAction(nameof(GetById), new { id }, new { id });
        }

        /// <summary>
        /// Update an existing department.
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentCommand command)
        {
            command.Id = id;
            command.UpdatedBy = User.Identity?.Name ?? "system";
            var result = await _mediator.Send(command);
            if (!result) return NotFound();
            return NoContent();
        }

        /// <summary>
        /// Delete (soft-delete) a department.
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var result = await _mediator.Send(new DeleteDepartmentCommand { Id = id });
            if (!result) return NotFound();
            return NoContent();
        }
    }
}