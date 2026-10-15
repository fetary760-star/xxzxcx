using System;
using MediatR;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    /// <summary>
    /// Create a new department.
    /// </summary>
    public class CreateDepartmentCommand : IRequest<Guid>
    {
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;

        // AMENDED (department-create 400): nullable on purpose. With <Nullable>enable</Nullable>
        // a non-nullable `string` gets an IMPLICIT [Required] from ASP.NET Core model
        // validation, so a body carrying "description": null (the Next.js proxy sanitizer
        // rewrites "" -> null because the key ends in the date-suffix heuristic "on")
        // answered 400 "The Description field is required." before the handler ever ran.
        public string? Description { get; set; }
        public long? DirectorUserId { get; set; }
        public Guid? ParentDepartmentId { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
    }

    /// <summary>
    /// Update an existing department.
    /// </summary>
    public class UpdateDepartmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;

        // AMENDED: same nullable rationale as CreateDepartmentCommand.Description.
        public string? Description { get; set; }
        public long? DirectorUserId { get; set; }
        public Guid? ParentDepartmentId { get; set; }
        public bool IsActive { get; set; }
        public string UpdatedBy { get; set; } = string.Empty;
    }

    /// <summary>
    /// Delete (soft-delete) a department.
    /// </summary>
    public class DeleteDepartmentCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
    }
}
