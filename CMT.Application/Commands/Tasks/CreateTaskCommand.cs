using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Application.DTOs;
using CMT.Application.Common;
using CMT.Application.Services;
using CMT.Domain.Data;
using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;
using TaskStatusEnum = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Commands.Tasks;

public class CreateTaskCommand : IRequest<OperationResult<TaskDto>>
{
    public string? SerialNumber { get; set; }
    public string? PartNumber { get; set; }
    public string? PoNumber { get; set; }
    public string Description { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public int? SubTypeId { get; set; }
    public int? RequestTypeId { get; set; }
    public string? Comments { get; set; }
    public string AssignedEngineer { get; set; } = "Unassigned";
    public int? PriorityId { get; set; }
    public DateTime EstimatedCompletionDate { get; set; }
    public DateTime? TargetCompletionDate { get; set; }
    public string? AttachmentPath { get; set; }
    public bool IsDuplicate { get; set; } = false;
    public string? DuplicateJustification { get; set; }
    public int? ShopId { get; set; }
    public int CreatedBy { get; set; }
    public bool IsMandatory { get; set; } = false;
}

public class CreateTaskCommandHandler : IRequestHandler<CreateTaskCommand, OperationResult<TaskDto>>
{
    private readonly ApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IDuplicateDetectionService _duplicateDetectionService;
    private readonly ILogger<CreateTaskCommandHandler> _logger;

    public CreateTaskCommandHandler(
        ApplicationDbContext context, 
        INotificationService notificationService,
        IDuplicateDetectionService duplicateDetectionService,
        ILogger<CreateTaskCommandHandler> logger)
    {
        _context = context;
        _notificationService = notificationService;
        _duplicateDetectionService = duplicateDetectionService;
        _logger = logger;
    }

    public async System.Threading.Tasks.Task<OperationResult<TaskDto>> Handle(CreateTaskCommand request, CancellationToken cancellationToken)
    {
        var result = new OperationResult<TaskDto>();

        try
        {
            // FIXED: Updated validation to match new mandatory field requirements
            if (request.CategoryId <= 0)
            {
                result.AddError(ErrorCode.ValidationError, "Category Type is required");
                return result;
            }

            if (!request.SubTypeId.HasValue || request.SubTypeId <= 0)
            {
                result.AddError(ErrorCode.ValidationError, "Sub Type is required");
                return result;
            }

            // FIXED: Serial Number is now optional - validation removed

            if (string.IsNullOrWhiteSpace(request.PartNumber))
            {
                result.AddError(ErrorCode.ValidationError, "Part Number is required");
                return result;
            }

            if (string.IsNullOrWhiteSpace(request.Description))
            {
                result.AddError(ErrorCode.ValidationError, "Description is required");
                return result;
            }

            // Validate category exists
            var category = await _context.TaskCategories
                .FirstOrDefaultAsync(c => c.CategoryId == request.CategoryId, cancellationToken);
            
            if (category == null)
            {
                result.AddError(ErrorCode.NotFound, "Category not found");
                return result;
            }

            // Validate sub type exists and belongs to the selected category
            var subType = await _context.TaskSubTypes
                .FirstOrDefaultAsync(st => st.SubTypeId == request.SubTypeId && st.CategoryId == request.CategoryId, cancellationToken);
            
            if (subType == null)
            {
                result.AddError(ErrorCode.NotFound, "Sub Type not found or does not belong to the selected category");
                return result;
            }

            // CRITICAL FIX: Auto-populate ShopId from creator's user record if not provided
            if (!request.ShopId.HasValue || request.ShopId.Value <= 0)
            {
                var creator = await _context.Users
                    .FirstOrDefaultAsync(u => u.UserId == request.CreatedBy, cancellationToken);
                
                if (creator != null && creator.ShopId.HasValue)
                {
                    request.ShopId = creator.ShopId.Value;
                    _logger.LogInformation("Auto-populated ShopId={ShopId} from creator UserId={UserId}", 
                        request.ShopId, request.CreatedBy);
                }
                else
                {
                    _logger.LogWarning("Creator UserId={UserId} has no assigned shop. Task will be created without shop assignment.", 
                        request.CreatedBy);
                }
            }

            // Priority is optional - "None" is a valid default.
            // Only validate that the priority exists if one was explicitly provided.
            if (request.PriorityId.HasValue && request.PriorityId.Value > 0)
            {
                var priorityExists = await _context.TaskPriorityLevels
                    .AnyAsync(p => p.PriorityId == request.PriorityId.Value, cancellationToken);
                
                if (!priorityExists)
                {
                    result.AddError(ErrorCode.NotFound, "Selected priority not found");
                    return result;
                }
            }

            // Calculate target completion date if not provided
            if (!request.TargetCompletionDate.HasValue && request.CategoryId > 0)
{
    var targetDuration = await _context.TaskCategoryTargetDays
        .Where(t => t.CategoryId == request.CategoryId && t.RecordStatus == RecordStatus.Active)
        .Select(t => new { t.TargetDays, t.TargetHours, t.TargetMinutes })
        .FirstOrDefaultAsync(cancellationToken);

    if (targetDuration != null && (targetDuration.TargetDays > 0 || targetDuration.TargetHours > 0 || targetDuration.TargetMinutes > 0))
    {
        request.TargetCompletionDate = request.EstimatedCompletionDate
            .AddDays(targetDuration.TargetDays)
            .AddHours(targetDuration.TargetHours)
            .AddMinutes(targetDuration.TargetMinutes);
    }
}


            // FIXED: Perform automatic duplicate detection if not explicitly marked as duplicate
            if (!request.IsDuplicate)
            {
                var duplicateCheckRequest = new DuplicateCheckRequest
                {
                    SerialNumber = request.SerialNumber,
                    PartNumber = request.PartNumber,
                    PoNumber = request.PoNumber,
                    Description = request.Description,
                    CategoryId = request.CategoryId,
                    SubTypeId = request.SubTypeId,
                    IncludeCompleted = false
                };

                var duplicateCheckResult = await _duplicateDetectionService.CheckDuplicatesAsync(duplicateCheckRequest);
                
                if (duplicateCheckResult.IsSuccess && duplicateCheckResult.Payload?.IsDuplicate == true)
                {
                    _logger.LogWarning("Duplicate task detected during creation: SerialNumber={SerialNumber}, PartNumber={PartNumber}, Found {Count} duplicates",
                        request.SerialNumber, request.PartNumber, duplicateCheckResult.Payload.TotalDuplicates);
                    
                    // Auto-mark as duplicate if no justification provided
                    if (string.IsNullOrWhiteSpace(request.DuplicateJustification))
                    {
                        request.IsDuplicate = true;
                        request.DuplicateJustification = $"Auto-detected duplicate. Found {duplicateCheckResult.Payload.TotalDuplicates} similar task(s).";
                    }
                }
            }

            // Create new task
            var task = new TaskEntity
            {
                SerialNumber = request.SerialNumber ?? string.Empty,
                PartNumber = request.PartNumber ?? string.Empty,
                PoNumber = request.PoNumber ?? string.Empty,
                Description = request.Description,
                CategoryId = request.CategoryId,
                SubTypeId = request.SubTypeId,
                RequestTypeId = request.RequestTypeId,
                Comments = request.Comments,
                AssignedEngineer = request.AssignedEngineer,
                PriorityId = request.PriorityId,
                EstimatedCompletionDate = request.EstimatedCompletionDate,
                TargetCompletionDate = request.TargetCompletionDate ?? request.EstimatedCompletionDate,
                AttachmentPath = request.AttachmentPath,
                IsDuplicate = request.IsDuplicate,
                DuplicateJustification = request.DuplicateJustification,
                ShopId = request.ShopId,
                CreatedBy = request.CreatedBy,
                IsMandatory = request.IsMandatory,
                Status = TaskStatusEnum.Pending
            };

            _context.Tasks.Add(task);
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Task created: TaskId={TaskId}, ShopId={ShopId}, ShopName={ShopName}, IsDuplicate={IsDuplicate}, DuplicateJustification={Justification}",
                task.TaskId, task.ShopId, task.Shop?.Name ?? "N/A", task.IsDuplicate, task.DuplicateJustification);

            // FIXED: Create a TaskComment entry for initial comments if provided
            if (!string.IsNullOrWhiteSpace(request.Comments))
            {
                var initialComment = new TaskComment
                {
                    TaskId = task.TaskId,
                    AuthorId = request.CreatedBy,
                    Content = request.Comments,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CMT.Domain.Enums.CommentType.UserComment
                };

                _context.TaskComments.Add(initialComment);
                await _context.SaveChangesAsync(cancellationToken);
            }

            // FIXED: Create individual duplicate alert if task is marked as duplicate
            if (task.IsDuplicate)
            {
                await CreateDuplicateAlert(task.TaskId, request.CreatedBy, request.DuplicateJustification ?? "Duplicate task created");
            }

            // Load related entities
            await _context.Entry(task)
                .Reference(t => t.Category)
                .LoadAsync(cancellationToken);

            await _context.Entry(task)
                .Reference(t => t.Priority)
                .LoadAsync(cancellationToken);

            await _context.Entry(task)
                .Reference(t => t.Creator)
                .LoadAsync(cancellationToken);

            await _context.Entry(task)
                .Reference(t => t.Shop)
                .LoadAsync(cancellationToken);

            // Send notifications to assigned engineers
            if (!string.IsNullOrEmpty(request.AssignedEngineer) && request.AssignedEngineer != "Unassigned")
            {
                var assignedEngineers = request.AssignedEngineer.Split(',').Select(e => e.Trim());
                await _notificationService.NotifyAssignedEngineersAsync(task.TaskId, assignedEngineers, cancellationToken);
            }

            // Map to DTO
            var taskDto = MapToDto(task);
            result.Payload = taskDto;

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating task");
            result.AddError(ErrorCode.ServerError, ex.Message);
            return result;
        }
    }

    // FIXED: Helper method to create individual duplicate alert
    private async System.Threading.Tasks.Task CreateDuplicateAlert(int taskId, int userId, string notes)
    {
        var notification = new Notification
        {
            Message = $"Task TC-{taskId} is marked as duplicate. {notes}",
            NotificationType = "duplicate",
            Priority = "High",
            UserId = userId,
            TaskId = taskId,
            RelatedEntity = taskId.ToString(),
            ActionUrl = $"/tasks/{taskId}",
            IsRead = false,
            CreatedAt = DateTime.UtcNow,
            StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
            TimeZoneInfo = "UTC",
            RegisteredDate = DateTime.UtcNow,
            RegisteredBy = "System",
            LastUpdateDate = DateTime.UtcNow,
            UpdatedBy = "System",
            RecordStatus = RecordStatus.Active,
            IsReadOnly = false
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync();
    }

    // FIXED: Include IsDuplicate, DuplicateJustification, ShopId and ShopName in DTO mapping
    private static TaskDto MapToDto(TaskEntity task)
    {
        return new TaskDto
        {
            TaskId = task.TaskId,
            SerialNumber = task.SerialNumber,
            PartNumber = task.PartNumber,
            PoNumber = task.PoNumber,
            Description = task.Description,
            CategoryId = task.CategoryId,
            CategoryName = task.Category?.Name,
            SubTypeId = task.SubTypeId,
            RequestTypeId = task.RequestTypeId,
            Status = task.Status,
            Comments = task.Comments,
            AssignedEngineer = task.AssignedEngineer,
            PriorityId = task.PriorityId,
            PriorityName = task.Priority?.LevelName,
            EstimatedCompletionDate = task.EstimatedCompletionDate,
            TargetCompletionDate = task.TargetCompletionDate,
            ActualCompletionDate = task.ActualCompletionDate,
            AttachmentPath = task.AttachmentPath,
            ShopId = task.ShopId,
            ShopName = task.Shop?.Name,
            CreatedBy = task.CreatedBy,
            CreatedByName = task.Creator?.Username,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt,
            // FIXED: Include duplicate fields in DTO
            IsDuplicate = task.IsDuplicate,
            DuplicateJustification = task.DuplicateJustification
        };
    }
}