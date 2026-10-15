using Microsoft.EntityFrameworkCore;
using CMT.Application.DTOs;
using CMT.Domain.Data;
using CMT.Domain.Models;
using CMT.Application.Interfaces;
using Microsoft.Extensions.Logging;
using TaskEntity = CMT.Domain.Models.Task;

namespace CMT.Application.Services;

public interface IEnhancedAmendmentService : IAmendmentService
{
    Task<ServiceResult<AmendmentRequestDto>> CreateAmendmentRequestAsync(int taskId, int requesterId, string reason, string requestType = "Amendment", CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentRequestDto>> ReviewAmendmentRequestAsync(int amendmentRequestId, int reviewerId, string decision, string reviewComments, CancellationToken cancellationToken = default);
    Task<ServiceResult<List<AmendmentAuditTrailDto>>> GetAmendmentAuditTrailAsync(int amendmentRequestId, CancellationToken cancellationToken = default);
    Task<ServiceResult<List<TaskStatusHistoryDto>>> GetTaskStatusHistoryAsync(int taskId, CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentRequestDto>> ReopenTaskWithAuditAsync(int taskId, int reopenedBy, string reopenReason, List<string> assignedEngineers, string newStatus = "Pending", CancellationToken cancellationToken = default);
    Task<ServiceResult<List<AmendmentRequestDto>>> GetPendingAmendmentRequestsAsync(int userId, string userRole, CancellationToken cancellationToken = default);
}

public class EnhancedAmendmentService : IEnhancedAmendmentService
{
    private readonly ApplicationDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly ILogger<EnhancedAmendmentService> _logger;

    public EnhancedAmendmentService(
        ApplicationDbContext context, 
        INotificationService notificationService,
        ILogger<EnhancedAmendmentService> logger)
    {
        _context = context;
        _notificationService = notificationService;
        _logger = logger;
    }

    // CRITICAL FIX: Enhanced CreateAmendmentRequestAsync to support both active and completed tasks
    public async Task<ServiceResult<AmendmentRequestDto>> CreateAmendmentRequestAsync(
        int taskId, 
        int requesterId, 
        string reason, 
        string requestType = "Amendment", 
        CancellationToken cancellationToken = default)
    {
        try
        {
            // CRITICAL FIX: First check if task exists in tasks table
            var task = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

            // CRITICAL FIX: If not in tasks table, check completed_tasks table
            CompletedTask? completedTask = null;
            if (task == null)
            {
                _logger.LogInformation("Task {TaskId} not found in tasks table, checking completed_tasks table", taskId);
                completedTask = await _context.CompletedTasks
                    .Include(ct => ct.Creator)
                    .Include(ct => ct.Category)
                    .FirstOrDefaultAsync(ct => ct.OriginalTaskId == taskId, cancellationToken);

                if (completedTask == null)
                {
                    return ServiceResult<AmendmentRequestDto>.Failure("Task not found in either active or completed tasks");
                }
            }

            var requester = await _context.Users.FindAsync(requesterId);
            if (requester == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Requester not found");
            }

            // CRITICAL: Only engineers can request amendments
            if (requester.Role != CMT.Domain.Models.UserRole.Engineer)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Only engineers can request amendments");
            }

            // Check if there's already a pending amendment request
            var existingRequest = await _context.Set<AmendmentRequest>()
                .FirstOrDefaultAsync(ar => ar.TaskId == taskId && 
                    (ar.Status == "Pending TL Review" || ar.Status == "Forwarded to Director"), 
                    cancellationToken);

            if (existingRequest != null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("There is already a pending amendment request for this task");
            }

            // Determine priority level
            string priorityLevel = task != null 
                ? DeterminePriorityLevel(task) 
                : DeterminePriorityLevelFromCompleted(completedTask!);

            // Create amendment request
            var amendmentRequest = new AmendmentRequest
            {
                TaskId = taskId,
                OriginalTaskId = completedTask?.OriginalTaskId ?? taskId,
                RequesterId = requesterId,
                RequestReason = reason,
                RequestType = requestType,
                Status = "Pending TL Review",
                PriorityLevel = priorityLevel,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                RegisteredBy = requester.FullName,
                RegisteredDate = DateTime.UtcNow,
                StartDate = DateTime.UtcNow,
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.Set<AmendmentRequest>().Add(amendmentRequest);
            await _context.SaveChangesAsync(cancellationToken);

            // CRITICAL FIX: Update task or completed task with amendment request info
            if (task != null)
            {
                // Update active task
                task.AmendmentRequest = true;
                task.AmendmentStatus = CMT.Domain.Enums.AmendmentStatus.PendingTLReview;
                task.AmendmentRequestId = amendmentRequest.AmendmentRequestId;
                task.AmendmentRequestedAt = DateTime.UtcNow;
                task.AmendmentRequestedBy = requesterId;
                task.AmendmentReason = reason;
                task.ShowRevisionAlert = true;
                task.UpdatedAt = DateTime.UtcNow;
            }
            else if (completedTask != null)
            {
                // Update completed task
                completedTask.AmendmentRequest = true;
                completedTask.AmendmentStatus = CMT.Domain.Enums.AmendmentStatus.PendingTLReview;
                completedTask.AmendmentRequestId = amendmentRequest.AmendmentRequestId;
                completedTask.AmendmentRequestedAt = DateTime.UtcNow;
                completedTask.AmendmentRequestedBy = requesterId;
                completedTask.AmendmentReason = reason;
                completedTask.ShowRevisionAlert = true;
                completedTask.TaskUpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync(cancellationToken);

            // CRITICAL FIX: Create audit trail entry WITHOUT task_id foreign key reference
            // Store task_id as a simple integer field instead of a foreign key
            var auditTrail = new AmendmentAuditTrail
            {
                AmendmentRequestId = amendmentRequest.AmendmentRequestId,
                TaskId = taskId, // Store as integer, not as FK reference
                ActionType = "Created",
                ActionByUserId = requesterId,
                ActionByRole = requester.Role.ToString(),
                NewStatus = "Pending TL Review",
                ActionComments = reason,
                ActionTimestamp = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = requester.FullName,
                RegisteredDate = DateTime.UtcNow
            };

            _context.Set<AmendmentAuditTrail>().Add(auditTrail);
            await _context.SaveChangesAsync(cancellationToken);

            // Send notifications to Team Leaders
            await _notificationService.NotifyAmendmentRequestAsync(taskId, requester.FullName, reason, cancellationToken);

            var dto = task != null 
                ? MapToAmendmentRequestDto(amendmentRequest, task, requester)
                : MapToAmendmentRequestDtoFromCompleted(amendmentRequest, completedTask!, requester);
            
            return ServiceResult<AmendmentRequestDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating amendment request for task {TaskId}", taskId);
            return ServiceResult<AmendmentRequestDto>.Failure($"Error creating amendment request: {ex.Message}");
        }
    }

    // CRITICAL FIX: Enforce role-based restrictions - TL can only forward/reject, Director can only approve/reject
    public async Task<ServiceResult<AmendmentRequestDto>> ReviewAmendmentRequestAsync(
        int amendmentRequestId, 
        int reviewerId, 
        string decision, 
        string reviewComments, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var amendmentRequest = await _context.Set<AmendmentRequest>()
                .Include(ar => ar.Requester)
                .FirstOrDefaultAsync(ar => ar.AmendmentRequestId == amendmentRequestId, cancellationToken);

            if (amendmentRequest == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Amendment request not found");
            }

            var reviewer = await _context.Users.FindAsync(reviewerId);
            if (reviewer == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Reviewer not found");
            }

            // CRITICAL FIX: Check both tasks and completed_tasks tables
            var task = await _context.Tasks.FirstOrDefaultAsync(t => t.TaskId == amendmentRequest.TaskId, cancellationToken);
            var completedTask = task == null 
                ? await _context.CompletedTasks.FirstOrDefaultAsync(ct => ct.OriginalTaskId == amendmentRequest.TaskId, cancellationToken)
                : null;

            if (task == null && completedTask == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Task not found in either active or completed tasks");
            }

            // CRITICAL: Enforce role-based restrictions
            var isTeamLeader = reviewer.Role == CMT.Domain.Models.UserRole.TeamLeader;
            var isDirector = reviewer.Role == CMT.Domain.Models.UserRole.Director;

            if (!isTeamLeader && !isDirector)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Only Team Leaders and Directors can review amendment requests");
            }

            // CRITICAL: Team Leaders can ONLY forward or reject (NOT approve)
            if (isTeamLeader && decision.ToLower() == "approve")
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Team Leaders cannot approve amendments directly. Please forward to Director or reject.");
            }

            // CRITICAL: Directors can ONLY approve or reject (NOT forward)
            if (isDirector && decision.ToLower() == "forward")
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Directors cannot forward amendments. Please approve or reject.");
            }

            // CRITICAL: Check current status matches reviewer role
            if (isTeamLeader && amendmentRequest.Status != "Pending TL Review")
            {
                return ServiceResult<AmendmentRequestDto>.Failure("This amendment is not pending Team Leader review");
            }

            if (isDirector && amendmentRequest.Status != "Forwarded to Director")
            {
                return ServiceResult<AmendmentRequestDto>.Failure("This amendment has not been forwarded to Director");
            }

            var previousStatus = amendmentRequest.Status;
            string newStatus;
            CMT.Domain.Enums.AmendmentStatus taskAmendmentStatus;

            // Determine new status based on decision and reviewer role
            switch (decision.ToLower())
            {
                case "approve":
                    if (!isDirector)
                    {
                        return ServiceResult<AmendmentRequestDto>.Failure("Only Directors can approve amendments");
                    }
                    newStatus = "Approved";
                    taskAmendmentStatus = CMT.Domain.Enums.AmendmentStatus.Approved;
                    amendmentRequest.FinalStatus = "Approved";
                    amendmentRequest.ResolvedAt = DateTime.UtcNow;
                    amendmentRequest.ResolvedById = reviewerId;
                    break;
                case "reject":
                    newStatus = "Rejected";
                    taskAmendmentStatus = CMT.Domain.Enums.AmendmentStatus.Rejected;
                    amendmentRequest.FinalStatus = "Rejected";
                    amendmentRequest.ResolvedAt = DateTime.UtcNow;
                    amendmentRequest.ResolvedById = reviewerId;
                    break;
                case "forward":
                    if (!isTeamLeader)
                    {
                        return ServiceResult<AmendmentRequestDto>.Failure("Only Team Leaders can forward amendment requests to Director");
                    }
                    newStatus = "Forwarded to Director";
                    taskAmendmentStatus = CMT.Domain.Enums.AmendmentStatus.ForwardedToDirector;
                    break;
                default:
                    return ServiceResult<AmendmentRequestDto>.Failure("Invalid decision. Must be 'approve', 'reject', or 'forward'");
            }

            // Update amendment request
            amendmentRequest.Status = newStatus;
            amendmentRequest.UpdatedAt = DateTime.UtcNow;

            if (reviewer.Role == CMT.Domain.Models.UserRole.TeamLeader)
            {
                amendmentRequest.ReviewedByTlId = reviewerId;
                amendmentRequest.TlReviewDate = DateTime.UtcNow;
                amendmentRequest.TlReviewComments = reviewComments;
                amendmentRequest.TlDecision = decision;
            }
            else if (reviewer.Role == CMT.Domain.Models.UserRole.Director)
            {
                amendmentRequest.ReviewedByDirectorId = reviewerId;
                amendmentRequest.DirectorReviewDate = DateTime.UtcNow;
                amendmentRequest.DirectorReviewComments = reviewComments;
                amendmentRequest.DirectorDecision = decision;
            }

            // CRITICAL FIX: Update task or completed task
            if (task != null)
            {
                task.AmendmentStatus = taskAmendmentStatus;
                task.AmendmentReviewedByTlId = reviewer.Role == CMT.Domain.Models.UserRole.TeamLeader ? reviewerId : task.AmendmentReviewedByTlId;
                task.UpdatedAt = DateTime.UtcNow;

                if (decision.ToLower() == "approve")
                {
                    task.ShowRevisionAlert = false;
                }
                else if (decision.ToLower() == "reject")
                {
                    task.AmendmentRequest = false;
                    task.ShowRevisionAlert = false;
                }
            }
            else if (completedTask != null)
            {
                completedTask.AmendmentStatus = taskAmendmentStatus;
                completedTask.AmendmentReviewedByTlId = reviewer.Role == CMT.Domain.Models.UserRole.TeamLeader ? reviewerId : completedTask.AmendmentReviewedByTlId;
                completedTask.TaskUpdatedAt = DateTime.UtcNow;

                if (decision.ToLower() == "approve")
                {
                    completedTask.ShowRevisionAlert = false;
                }
                else if (decision.ToLower() == "reject")
                {
                    completedTask.AmendmentRequest = false;
                    completedTask.ShowRevisionAlert = false;
                }
            }

            await _context.SaveChangesAsync(cancellationToken);

            // Create audit trail entry
            var auditTrail = new AmendmentAuditTrail
            {
                AmendmentRequestId = amendmentRequestId,
                TaskId = amendmentRequest.TaskId,
                ActionType = decision.ToLower() == "forward" ? "Forwarded" : decision,
                ActionByUserId = reviewerId,
                ActionByRole = reviewer.Role.ToString(),
                PreviousStatus = previousStatus,
                NewStatus = newStatus,
                ActionComments = reviewComments,
                ActionTimestamp = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = reviewer.FullName,
                RegisteredDate = DateTime.UtcNow
            };

            _context.Set<AmendmentAuditTrail>().Add(auditTrail);
            await _context.SaveChangesAsync(cancellationToken);

            // Send notification
            var statusMessage = decision.ToLower() == "approve" ? "approved" : 
                               decision.ToLower() == "reject" ? "rejected" : "forwarded to Director";
            
            await _notificationService.NotifyTaskStatusChangeAsync(
                amendmentRequest.TaskId, 
                $"Amendment {statusMessage}", 
                reviewer.FullName, 
                cancellationToken);

            var dto = task != null
                ? MapToAmendmentRequestDto(amendmentRequest, task, amendmentRequest.Requester)
                : MapToAmendmentRequestDtoFromCompleted(amendmentRequest, completedTask!, amendmentRequest.Requester);
            
            return ServiceResult<AmendmentRequestDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reviewing amendment request {AmendmentRequestId}", amendmentRequestId);
            return ServiceResult<AmendmentRequestDto>.Failure($"Error reviewing amendment request: {ex.Message}");
        }
    }

    public async Task<ServiceResult<AmendmentRequestDto>> ReopenTaskWithAuditAsync(
        int taskId, 
        int reopenedBy, 
        string reopenReason, 
        List<string> assignedEngineers, 
        string newStatus = "Pending", 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("Task not found");
            }

            var reopener = await _context.Users.FindAsync(reopenedBy);
            if (reopener == null)
            {
                return ServiceResult<AmendmentRequestDto>.Failure("User not found");
            }

            var previousStatus = task.Status.ToString();
            var currentReopenCount = task.ReopenCount;

            // Update task with reopen information
            task.Status = newStatus.ToLower() == "pending" ? CMT.Domain.Enums.TaskStatus.Pending : CMT.Domain.Enums.TaskStatus.InProgress;
            task.IsReopened = true;
            task.ReopenCount = currentReopenCount + 1;
            task.ReopenedBy = reopenedBy;
            task.ReopenedAt = DateTime.UtcNow;
            task.ReopenReason = reopenReason;
            task.AssignedEngineer = string.Join(", ", assignedEngineers);
            task.ActualCompletionDate = null;
            task.ShowRevisionAlert = true;
            task.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            // Create task status history entry
            var statusHistory = new TaskStatusHistory
            {
                TaskId = taskId,
                PreviousStatus = previousStatus,
                NewStatus = newStatus,
                StatusChangeReason = reopenReason,
                ChangedByUserId = reopenedBy,
                ChangedByRole = reopener.Role.ToString(),
                ChangeTimestamp = DateTime.UtcNow,
                IsReopenAction = true,
                ReopenCount = currentReopenCount + 1,
                AssignedEngineers = string.Join(", ", assignedEngineers),
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = reopener.FullName,
                RegisteredDate = DateTime.UtcNow
            };

            _context.Set<TaskStatusHistory>().Add(statusHistory);
            await _context.SaveChangesAsync(cancellationToken);

            // Create amendment request for reopen action
            var amendmentRequest = new AmendmentRequest
            {
                TaskId = taskId,
                RequesterId = reopenedBy,
                RequestReason = reopenReason,
                RequestType = "Reopen",
                Status = "Approved", // Reopen is automatically approved
                FinalStatus = "Approved",
                ResolvedAt = DateTime.UtcNow,
                ResolvedById = reopenedBy,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                RegisteredBy = reopener.FullName,
                RegisteredDate = DateTime.UtcNow,
                StartDate = DateTime.UtcNow,
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.Set<AmendmentRequest>().Add(amendmentRequest);
            await _context.SaveChangesAsync(cancellationToken);

            // Create audit trail entry
            var auditTrail = new AmendmentAuditTrail
            {
                AmendmentRequestId = amendmentRequest.AmendmentRequestId,
                TaskId = taskId,
                ActionType = "Reopened",
                ActionByUserId = reopenedBy,
                ActionByRole = reopener.Role.ToString(),
                PreviousStatus = previousStatus,
                NewStatus = newStatus,
                ActionComments = reopenReason,
                ActionTimestamp = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                RegisteredBy = reopener.FullName,
                RegisteredDate = DateTime.UtcNow
            };

            _context.Set<AmendmentAuditTrail>().Add(auditTrail);
            await _context.SaveChangesAsync(cancellationToken);

            var dto = MapToAmendmentRequestDto(amendmentRequest, task, reopener);
            return ServiceResult<AmendmentRequestDto>.Success(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reopening task {TaskId}", taskId);
            return ServiceResult<AmendmentRequestDto>.Failure($"Error reopening task: {ex.Message}");
        }
    }

    public async Task<ServiceResult<List<AmendmentAuditTrailDto>>> GetAmendmentAuditTrailAsync(
        int amendmentRequestId, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var auditTrail = await _context.Set<AmendmentAuditTrail>()
                .Include(at => at.ActionByUser)
                .Where(at => at.AmendmentRequestId == amendmentRequestId)
                .OrderBy(at => at.ActionTimestamp)
                .ToListAsync(cancellationToken);

            var dtos = auditTrail.Select(at => new AmendmentAuditTrailDto
            {
                AuditId = at.AuditId,
                AmendmentRequestId = at.AmendmentRequestId,
                TaskId = at.TaskId,
                ActionType = at.ActionType,
                ActionByUserId = at.ActionByUserId,
                ActionByUserName = at.ActionByUser.FullName,
                ActionByRole = at.ActionByRole,
                PreviousStatus = at.PreviousStatus,
                NewStatus = at.NewStatus,
                ActionComments = at.ActionComments,
                ActionTimestamp = at.ActionTimestamp,
                IpAddress = at.IpAddress,
                UserAgent = at.UserAgent
            }).ToList();

            return ServiceResult<List<AmendmentAuditTrailDto>>.Success(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting amendment audit trail for request {AmendmentRequestId}", amendmentRequestId);
            return ServiceResult<List<AmendmentAuditTrailDto>>.Failure($"Error getting audit trail: {ex.Message}");
        }
    }

    public async Task<ServiceResult<List<TaskStatusHistoryDto>>> GetTaskStatusHistoryAsync(
        int taskId, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var statusHistory = await _context.Set<TaskStatusHistory>()
                .Include(sh => sh.ChangedByUser)
                .Include(sh => sh.RelatedAmendmentRequest)
                .Where(sh => sh.TaskId == taskId)
                .OrderBy(sh => sh.ChangeTimestamp)
                .ToListAsync(cancellationToken);

            var dtos = statusHistory.Select(sh => new TaskStatusHistoryDto
            {
                HistoryId = sh.HistoryId,
                TaskId = sh.TaskId,
                OriginalTaskId = sh.OriginalTaskId,
                PreviousStatus = sh.PreviousStatus,
                NewStatus = sh.NewStatus,
                StatusChangeReason = sh.StatusChangeReason,
                ChangedByUserId = sh.ChangedByUserId,
                ChangedByUserName = sh.ChangedByUser.FullName,
                ChangedByRole = sh.ChangedByRole,
                ChangeTimestamp = sh.ChangeTimestamp,
                IsReopenAction = sh.IsReopenAction,
                ReopenCount = sh.ReopenCount,
                AssignedEngineers = sh.AssignedEngineers,
                RelatedAmendmentRequestId = sh.RelatedAmendmentRequestId
            }).ToList();

            return ServiceResult<List<TaskStatusHistoryDto>>.Success(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting task status history for task {TaskId}", taskId);
            return ServiceResult<List<TaskStatusHistoryDto>>.Failure($"Error getting status history: {ex.Message}");
        }
    }

    public async Task<ServiceResult<List<AmendmentRequestDto>>> GetPendingAmendmentRequestsAsync(
        int userId, 
        string userRole, 
        CancellationToken cancellationToken = default)
    {
        try
        {
            var query = _context.Set<AmendmentRequest>()
                .Include(ar => ar.Requester)
                .Include(ar => ar.ReviewedByTl)
                .Include(ar => ar.ReviewedByDirector)
                .Where(ar => ar.RecordStatus == RecordStatus.Active);

            // Filter based on user role
            switch (userRole.ToLower())
            {
                case "team_leader":
                    query = query.Where(ar => ar.Status == "Pending TL Review");
                    break;
                case "director":
                    query = query.Where(ar => ar.Status == "Forwarded to Director");
                    break;
                case "engineer":
                case "customer_personnel":
                    query = query.Where(ar => ar.RequesterId == userId);
                    break;
                default:
                    // For other roles, show all pending requests
                    query = query.Where(ar => ar.Status == "Pending TL Review" || ar.Status == "Forwarded to Director");
                    break;
            }

            var amendmentRequests = await query
                .OrderByDescending(ar => ar.CreatedAt)
                .ToListAsync(cancellationToken);

            var dtos = new List<AmendmentRequestDto>();
            foreach (var ar in amendmentRequests)
            {
                // Check both tasks and completed_tasks tables
                var task = await _context.Tasks.FirstOrDefaultAsync(t => t.TaskId == ar.TaskId, cancellationToken);
                var completedTask = task == null
                    ? await _context.CompletedTasks.FirstOrDefaultAsync(ct => ct.OriginalTaskId == ar.TaskId, cancellationToken)
                    : null;

                if (task != null)
                {
                    dtos.Add(MapToAmendmentRequestDto(ar, task, ar.Requester));
                }
                else if (completedTask != null)
                {
                    dtos.Add(MapToAmendmentRequestDtoFromCompleted(ar, completedTask, ar.Requester));
                }
            }

            return ServiceResult<List<AmendmentRequestDto>>.Success(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending amendment requests for user {UserId}", userId);
            return ServiceResult<List<AmendmentRequestDto>>.Failure($"Error getting pending requests: {ex.Message}");
        }
    }

    #region Legacy IAmendmentService Implementation

    public async Task<ServiceResult<AmendmentDto>> RequestAmendmentAsync(int taskId, int requesterId, string reason, CancellationToken cancellationToken = default)
    {
        var result = await CreateAmendmentRequestAsync(taskId, requesterId, reason, "Amendment", cancellationToken);
        
        if (!result.IsSuccess)
        {
            return ServiceResult<AmendmentDto>.Failure(result.Errors?.FirstOrDefault() ?? "Request failed");
        }

        var amendmentDto = new AmendmentDto
        {
            TaskId = result.Payload!.TaskId,
            TaskDescription = result.Payload.TaskDescription,
            SerialNumber = result.Payload.SerialNumber,
            PartNumber = result.Payload.PartNumber,
            Status = (CMT.Application.DTOs.AmendmentStatus)Enum.Parse(typeof(CMT.Application.DTOs.AmendmentStatus), result.Payload.Status.Replace(" ", ""), ignoreCase: true),
            RequestReason = result.Payload.RequestReason,
            RequestedAt = result.Payload.CreatedAt,
            RequesterName = result.Payload.RequesterName,
            RequesterId = result.Payload.RequesterId
        };

        return ServiceResult<AmendmentDto>.Success(amendmentDto);
    }

    public async Task<ServiceResult<AmendmentDto>> ReviewAmendmentAsync(int taskId, int reviewerId, CMT.Application.DTOs.AmendmentStatus decision, string reviewNotes, CancellationToken cancellationToken = default)
    {
        var amendmentRequest = await _context.Set<AmendmentRequest>()
            .FirstOrDefaultAsync(ar => ar.TaskId == taskId && 
                (ar.Status == "Pending TL Review" || ar.Status == "Forwarded to Director"), 
                cancellationToken);

        if (amendmentRequest == null)
        {
            return ServiceResult<AmendmentDto>.Failure("No pending amendment request found for this task");
        }

        var decisionString = decision switch
        {
            CMT.Application.DTOs.AmendmentStatus.Approved => "approve",
            CMT.Application.DTOs.AmendmentStatus.Rejected => "reject",
            CMT.Application.DTOs.AmendmentStatus.ForwardedToDirector => "forward",
            _ => "reject"
        };

        var result = await ReviewAmendmentRequestAsync(amendmentRequest.AmendmentRequestId, reviewerId, decisionString, reviewNotes, cancellationToken);
        
        if (!result.IsSuccess)
        {
            return ServiceResult<AmendmentDto>.Failure(result.Errors?.FirstOrDefault() ?? "Review failed");
        }

        var amendmentDto = new AmendmentDto
        {
            TaskId = result.Payload!.TaskId,
            TaskDescription = result.Payload.TaskDescription,
            SerialNumber = result.Payload.SerialNumber,
            PartNumber = result.Payload.PartNumber,
            Status = (CMT.Application.DTOs.AmendmentStatus)Enum.Parse(typeof(CMT.Application.DTOs.AmendmentStatus), result.Payload.Status.Replace(" ", ""), ignoreCase: true),
            RequestReason = result.Payload.RequestReason,
            ReviewNotes = reviewNotes,
            RequestedAt = result.Payload.CreatedAt,
            ReviewedAt = result.Payload.UpdatedAt,
            RequesterName = result.Payload.RequesterName,
            ReviewerName = result.Payload.ReviewerName,
            RequesterId = result.Payload.RequesterId,
            ReviewerId = reviewerId
        };

        return ServiceResult<AmendmentDto>.Success(amendmentDto);
    }

    public async Task<ServiceResult<AmendmentDto>> ApproveAmendmentAsync(int taskId, int approverId, string approvalNotes, CancellationToken cancellationToken = default)
    {
        return await ReviewAmendmentAsync(taskId, approverId, CMT.Application.DTOs.AmendmentStatus.Approved, approvalNotes, cancellationToken);
    }

    public async Task<ServiceResult<AmendmentDto>> RejectAmendmentAsync(int taskId, int rejectorId, string rejectionReason, CancellationToken cancellationToken = default)
    {
        return await ReviewAmendmentAsync(taskId, rejectorId, CMT.Application.DTOs.AmendmentStatus.Rejected, rejectionReason, cancellationToken);
    }

    public async Task<ServiceResult<AmendmentDto>> ForwardToDirectorAsync(int taskId, int teamLeaderId, string forwardingNotes, CancellationToken cancellationToken = default)
    {
        return await ReviewAmendmentAsync(taskId, teamLeaderId, CMT.Application.DTOs.AmendmentStatus.ForwardedToDirector, forwardingNotes, cancellationToken);
    }

    public async Task<ServiceResult<List<AmendmentDto>>> GetPendingAmendmentsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return ServiceResult<List<AmendmentDto>>.Failure("User not found");
        }

        var result = await GetPendingAmendmentRequestsAsync(userId, user.Role.ToString(), cancellationToken);
        
        if (!result.IsSuccess)
        {
            return ServiceResult<List<AmendmentDto>>.Failure(result.Errors?.FirstOrDefault() ?? "Failed to get pending amendments");
        }

        var amendmentDtos = result.Payload!.Select(ar => new AmendmentDto
        {
            TaskId = ar.TaskId,
            TaskDescription = ar.TaskDescription,
            SerialNumber = ar.SerialNumber,
            PartNumber = ar.PartNumber,
            Status = (CMT.Application.DTOs.AmendmentStatus)Enum.Parse(typeof(CMT.Application.DTOs.AmendmentStatus), ar.Status.Replace(" ", ""), ignoreCase: true),
            RequestReason = ar.RequestReason,
            RequestedAt = ar.CreatedAt,
            ReviewedAt = ar.UpdatedAt,
            RequesterName = ar.RequesterName,
            ReviewerName = ar.ReviewerName,
            RequesterId = ar.RequesterId,
            ReviewerId = ar.ReviewerId
        }).ToList();

        return ServiceResult<List<AmendmentDto>>.Success(amendmentDtos);
    }

    public async Task<ServiceResult<List<AmendmentDto>>> GetAmendmentHistoryAsync(int taskId, CancellationToken cancellationToken = default)
    {
        var amendmentRequests = await _context.Set<AmendmentRequest>()
            .Include(ar => ar.Requester)
            .Include(ar => ar.ReviewedByTl)
            .Include(ar => ar.ReviewedByDirector)
            .Where(ar => ar.TaskId == taskId)
            .OrderByDescending(ar => ar.CreatedAt)
            .ToListAsync(cancellationToken);

        var amendmentDtos = new List<AmendmentDto>();
        foreach (var ar in amendmentRequests)
        {
            // Check both tasks and completed_tasks tables
            var task = await _context.Tasks.FirstOrDefaultAsync(t => t.TaskId == ar.TaskId, cancellationToken);
            var completedTask = task == null
                ? await _context.CompletedTasks.FirstOrDefaultAsync(ct => ct.OriginalTaskId == ar.TaskId, cancellationToken)
                : null;

            var dto = new AmendmentDto
            {
                TaskId = ar.TaskId,
                TaskDescription = task?.Description ?? completedTask?.Description ?? "N/A",
                SerialNumber = task?.SerialNumber ?? completedTask?.SerialNumber ?? "",
                PartNumber = task?.PartNumber ?? completedTask?.PartNumber ?? "",
                Status = (CMT.Application.DTOs.AmendmentStatus)Enum.Parse(typeof(CMT.Application.DTOs.AmendmentStatus), ar.Status.Replace(" ", ""), ignoreCase: true),
                RequestReason = ar.RequestReason,
                ReviewNotes = ar.TlReviewComments ?? ar.DirectorReviewComments ?? "",
                RequestedAt = ar.CreatedAt,
                ReviewedAt = ar.TlReviewDate ?? ar.DirectorReviewDate,
                RequesterName = ar.Requester.FullName,
                ReviewerName = ar.ReviewedByTl?.FullName ?? ar.ReviewedByDirector?.FullName ?? "",
                RequesterId = ar.RequesterId,
                ReviewerId = ar.ReviewedByTlId ?? ar.ReviewedByDirectorId
            };
            amendmentDtos.Add(dto);
        }

        return ServiceResult<List<AmendmentDto>>.Success(amendmentDtos);
    }

    #endregion

    #region Private Helper Methods

    private string DeterminePriorityLevel(TaskEntity task)
    {
        // Business logic to determine priority level based on task properties
        if (!task.PriorityId.HasValue) return "None";
        if (task.PriorityId == 1) return "Critical";
        if (task.PriorityId == 2) return "High";
        if (task.PriorityId == 3) return "Normal";
        return "Low";
    }

    private string DeterminePriorityLevelFromCompleted(CompletedTask task)
    {
        // Business logic to determine priority level based on completed task properties
        if (!task.PriorityId.HasValue) return "None";
        if (task.PriorityId == 1) return "Critical";
        if (task.PriorityId == 2) return "High";
        if (task.PriorityId == 3) return "Normal";
        return "Low";
    }

    private AmendmentRequestDto MapToAmendmentRequestDto(AmendmentRequest amendmentRequest, TaskEntity task, User requester)
    {
        return new AmendmentRequestDto
        {
            AmendmentRequestId = amendmentRequest.AmendmentRequestId,
            TaskId = amendmentRequest.TaskId,
            OriginalTaskId = amendmentRequest.OriginalTaskId,
            TaskDescription = task.Description,
            SerialNumber = task.SerialNumber ?? "",
            PartNumber = task.PartNumber ?? "",
            RequestReason = amendmentRequest.RequestReason,
            RequestType = amendmentRequest.RequestType,
            Status = amendmentRequest.Status,
            PriorityLevel = amendmentRequest.PriorityLevel,
            RequesterId = amendmentRequest.RequesterId,
            RequesterName = requester.FullName,
            RequesterRole = requester.Role.ToString(),
            ReviewedByTlId = amendmentRequest.ReviewedByTlId,
            TlReviewDate = amendmentRequest.TlReviewDate,
            TlReviewComments = amendmentRequest.TlReviewComments,
            TlDecision = amendmentRequest.TlDecision,
            ReviewedByDirectorId = amendmentRequest.ReviewedByDirectorId,
            DirectorReviewDate = amendmentRequest.DirectorReviewDate,
            DirectorReviewComments = amendmentRequest.DirectorReviewComments,
            DirectorDecision = amendmentRequest.DirectorDecision,
            FinalStatus = amendmentRequest.FinalStatus,
            ResolvedAt = amendmentRequest.ResolvedAt,
            ResolvedById = amendmentRequest.ResolvedById,
            CreatedAt = amendmentRequest.CreatedAt,
            UpdatedAt = amendmentRequest.UpdatedAt,
            ReviewerName = amendmentRequest.ReviewedByTl?.FullName ?? amendmentRequest.ReviewedByDirector?.FullName ?? "",
            ReviewerId = amendmentRequest.ReviewedByTlId ?? amendmentRequest.ReviewedByDirectorId
        };
    }

    private AmendmentRequestDto MapToAmendmentRequestDtoFromCompleted(AmendmentRequest amendmentRequest, CompletedTask task, User requester)
    {
        return new AmendmentRequestDto
        {
            AmendmentRequestId = amendmentRequest.AmendmentRequestId,
            TaskId = amendmentRequest.TaskId,
            OriginalTaskId = amendmentRequest.OriginalTaskId ?? task.OriginalTaskId,
            TaskDescription = task.Description,
            SerialNumber = task.SerialNumber ?? "",
            PartNumber = task.PartNumber ?? "",
            RequestReason = amendmentRequest.RequestReason,
            RequestType = amendmentRequest.RequestType,
            Status = amendmentRequest.Status,
            PriorityLevel = amendmentRequest.PriorityLevel,
            RequesterId = amendmentRequest.RequesterId,
            RequesterName = requester.FullName,
            RequesterRole = requester.Role.ToString(),
            ReviewedByTlId = amendmentRequest.ReviewedByTlId,
            TlReviewDate = amendmentRequest.TlReviewDate,
            TlReviewComments = amendmentRequest.TlReviewComments,
            TlDecision = amendmentRequest.TlDecision,
            ReviewedByDirectorId = amendmentRequest.ReviewedByDirectorId,
            DirectorReviewDate = amendmentRequest.DirectorReviewDate,
            DirectorReviewComments = amendmentRequest.DirectorReviewComments,
            DirectorDecision = amendmentRequest.DirectorDecision,
            FinalStatus = amendmentRequest.FinalStatus,
            ResolvedAt = amendmentRequest.ResolvedAt,
            ResolvedById = amendmentRequest.ResolvedById,
            CreatedAt = amendmentRequest.CreatedAt,
            UpdatedAt = amendmentRequest.UpdatedAt,
            ReviewerName = amendmentRequest.ReviewedByTl?.FullName ?? amendmentRequest.ReviewedByDirector?.FullName ?? "",
            ReviewerId = amendmentRequest.ReviewedByTlId ?? amendmentRequest.ReviewedByDirectorId
        };
    }

    #endregion
}