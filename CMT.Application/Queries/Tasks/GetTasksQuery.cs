using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.DTOs;
using CMT.Application.Common;
using CMT.Domain.Data;
using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;

namespace CMT.Application.Queries;

public class GetTasksQuery : IRequest<OperationResult<List<TaskDto>>>
{
    public int? CategoryId { get; set; }
    public string? Status { get; set; }
    public string? AssignedEngineer { get; set; }
    public int? PriorityId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}

public class GetTasksQueryHandler : IRequestHandler<GetTasksQuery, OperationResult<List<TaskDto>>>
{
    private readonly ApplicationDbContext _context;

    public GetTasksQueryHandler(ApplicationDbContext context)
    {
        _context = context;
    }

    public async System.Threading.Tasks.Task<OperationResult<List<TaskDto>>> Handle(GetTasksQuery request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<List<TaskDto>>();

        try
        {
            var query = _context.Tasks
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Creator)
                .Include(t => t.Shop)
                .AsQueryable();

            // Apply filters
            if (request.CategoryId.HasValue)
                query = query.Where(t => t.CategoryId == request.CategoryId.Value);

            if (!string.IsNullOrEmpty(request.Status))
                query = query.Where(t => t.Status.ToString() == request.Status);

            if (!string.IsNullOrEmpty(request.AssignedEngineer))
                query = query.Where(t => t.AssignedEngineer.Contains(request.AssignedEngineer));

            if (request.PriorityId.HasValue)
                query = query.Where(t => t.PriorityId == request.PriorityId.Value);

            if (request.FromDate.HasValue)
                query = query.Where(t => t.CreatedAt >= request.FromDate.Value);

            if (request.ToDate.HasValue)
                query = query.Where(t => t.CreatedAt <= request.ToDate.Value);

            // Apply pagination
            var tasks = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((request.PageNumber - 1) * request.PageSize)
                .Take(request.PageSize)
                .Select(t => new TaskDto
                {
                    TaskId = t.TaskId,
                    SerialNumber = t.SerialNumber,
                    PartNumber = t.PartNumber,
                    PoNumber = t.PoNumber,
                    Description = t.Description,
                    CategoryId = t.CategoryId,
                    CategoryName = t.Category.Name,
                    SubTypeId = t.SubTypeId,
                    RequestTypeId = t.RequestTypeId,
                    Status = t.Status,
                    Comments = t.Comments,
                    AssignedEngineer = t.AssignedEngineer,
                    PriorityId = t.PriorityId,
                    PriorityName = t.Priority.LevelName,
                    EstimatedCompletionDate = t.EstimatedCompletionDate,
                    TargetCompletionDate = t.TargetCompletionDate,
                    ActualCompletionDate = t.ActualCompletionDate,
                    AttachmentPath = t.AttachmentPath,
                    ShopId = t.ShopId,
                    ShopName = t.Shop != null ? t.Shop.Name : null,
                    CreatedBy = t.CreatedBy,
                    CreatedByName = t.Creator.Username,
                    CreatedAt = t.CreatedAt,
                    UpdatedAt = t.UpdatedAt
                })
                .ToListAsync(cancellationToken);

            result.Payload = tasks;
            return result;
        }
        catch (Exception ex)
        {
            result.AddError(ErrorCode.ServerError, ex.Message);
            return result;
        }
    }
}