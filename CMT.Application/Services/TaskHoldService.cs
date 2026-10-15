using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using TaskEntity = CMT.Domain.Models.Task;
using TaskStatusEnum = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public class TaskHoldService : ITaskHoldService
    {
        private readonly ApplicationDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ITaskUpdateHistoryService _updateHistoryService;
        private readonly ILogger<TaskHoldService> _logger;

        public TaskHoldService(
            ApplicationDbContext context,
            INotificationService notificationService,
            ITaskUpdateHistoryService updateHistoryService,
            ILogger<TaskHoldService> logger)
        {
            _context = context;
            _notificationService = notificationService;
            _updateHistoryService = updateHistoryService;
            _logger = logger;
        }

        public async System.Threading.Tasks.Task<ServiceResult<TaskHoldRequestDto>> CreateHoldRequestAsync(
            int taskId,
            int engineerId,
            string holdReason,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var task = await _context.Tasks
                    .Include(t => t.Creator)
                    .Include(t => t.Category)
                    .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

                if (task == null)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Task not found");
                }

                var engineer = await _context.Users.FindAsync(engineerId);
                if (engineer == null)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Engineer not found");
                }

                // Check if engineer is assigned to this task
                if (!task.AssignedEngineer.Contains(engineer.FullName))
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Engineer is not assigned to this task");
                }

                // Check if there's already a pending hold request
                var existingRequest = await _context.Set<TaskHoldRequest>()
                    .FirstOrDefaultAsync(hr => hr.TaskId == taskId && hr.Status == "PendingApproval", cancellationToken);

                if (existingRequest != null)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("There is already a pending hold request for this task");
                }

                // Calculate days worked by engineer UP TO NOW (before hold)
                var daysWorked = await CalculateDaysWorkedInternalAsync(taskId, engineerId, cancellationToken);

                // Get the date when engineer was assigned
                var assignedDate = await GetEngineerAssignmentDateAsync(taskId, engineerId, cancellationToken);

                // CRITICAL: Record the OnHold date as NOW
                var onHoldDate = DateTime.UtcNow;

                // Create hold request
                var holdRequest = new TaskHoldRequest
                {
                    TaskId = taskId,
                    RequestedByEngineerId = engineerId,
                    HoldReason = holdReason,
                    DaysWorkedByEngineer = daysWorked,
                    AssignedDate = assignedDate,
                    HoldRequestedDate = onHoldDate, // This is the OnHold date
                    Status = "PendingApproval",
                    CreatedAt = onHoldDate,
                    UpdatedAt = onHoldDate,
                    RegisteredBy = engineer.FullName,
                    RegisteredDate = onHoldDate,
                    StartDate = onHoldDate,
                    EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                    TimeZoneInfo = "UTC",
                    RecordStatus = RecordStatus.Active,
                    IsReadOnly = false
                };

                _context.Set<TaskHoldRequest>().Add(holdRequest);

                // Change task status to OnHold - DATE COUNTING STOPS HERE
                var previousStatus = task.Status;
                task.Status = TaskStatusEnum.OnHold;
                task.UpdatedAt = onHoldDate;
                task.StatusChangedAt = onHoldDate; // BUG FIX: Track when status changed for synchronization

                await _context.SaveChangesAsync(cancellationToken);

                // Log the status change with OnHold date
                await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                {
                    TaskId = taskId,
                    UpdatedByUserId = engineerId,
                    UpdatedByUserName = engineer.FullName,
                    UpdatedByUserRole = engineer.Role.ToString(),
                    UpdateType = "STATUS_CHANGE_TO_HOLD",
                    FieldName = "Status",
                    OldValue = previousStatus.ToString(),
                    NewValue = "OnHold",
                    UpdateComment = $"Hold requested by engineer. Reason: {holdReason}. Days worked before hold: {daysWorked}. DATE COUNTING STOPPED.",
                    UpdatedAt = onHoldDate
                });

                // Reset engineer's date count to zero - COUNTING STOPS
                await ResetEngineerDateCountAsync(taskId, engineerId, daysWorked, onHoldDate, cancellationToken);

                // Send notification to Team Leaders
                await _notificationService.NotifyTeamLeadsAsync(taskId, new InterventionRequest
                {
                    TaskId = taskId,
                    RequestedBy = engineerId,
                    RequestedAt = onHoldDate,
                    EscalationLevel = "team_lead",
                    Status = "pending",
                    Comments = $"Hold request: {holdReason}. Engineer worked {daysWorked} days on this task. Date counting has stopped.",
                    UserRole = engineer.Role.ToString()
                });

                // CRITICAL FIX: Notify the task initiator (creator) when their task is put on hold
                // NotifyTaskStatusChangeAsync handles notifying the creator, assigned engineers, and team leaders
                // Since we already notified team leaders above, this will additionally ensure the creator is notified
                await _notificationService.NotifyTaskStatusChangeAsync(taskId, "OnHold", engineer.FullName, cancellationToken);

                var dto = MapToDto(holdRequest, task, engineer);
                
                _logger.LogInformation("Task {TaskId} put OnHold on {OnHoldDate}. Engineer {EngineerId} worked {Days} days. Date counting STOPPED. Notifications sent to task initiator and team leaders.", 
                    taskId, onHoldDate, engineerId, daysWorked);

                return ServiceResult<TaskHoldRequestDto>.Success(dto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating hold request for task {TaskId}", taskId);
                return ServiceResult<TaskHoldRequestDto>.Failure($"Error creating hold request: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<TaskHoldRequestDto>> ReviewHoldRequestAsync(
            int holdRequestId,
            int teamLeadId,
            string decision,
            string? action,
            string? reviewComments,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var holdRequest = await _context.Set<TaskHoldRequest>()
                    .Include(hr => hr.Task)
                        .ThenInclude(t => t.Creator)
                    .Include(hr => hr.RequestedByEngineer)
                    .FirstOrDefaultAsync(hr => hr.HoldRequestId == holdRequestId, cancellationToken);

                if (holdRequest == null)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Hold request not found");
                }

                var teamLead = await _context.Users.FindAsync(teamLeadId);
                if (teamLead == null)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Team Lead not found");
                }

                if (teamLead.Role != CMT.Domain.Models.UserRole.TeamLeader)
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Only Team Leaders can review hold requests");
                }

                if (holdRequest.Status != "PendingApproval")
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("This hold request has already been reviewed");
                }

                var task = holdRequest.Task;
                var reviewDate = DateTime.UtcNow;

                if (decision.ToLower() == "approve")
                {
                    if (string.IsNullOrEmpty(action))
                    {
                        return ServiceResult<TaskHoldRequestDto>.Failure("Action is required when approving hold request");
                    }

                    holdRequest.Status = "Approved";
                    holdRequest.ReviewedByTlId = teamLeadId;
                    holdRequest.ReviewDate = reviewDate;
                    holdRequest.ReviewComments = reviewComments;

                    switch (action.ToLower())
                    {
                        case "transfer_to_tl":
                            // Transfer date counts to Team Lead
                            await TransferDateCountToTeamLeadAsync(
                                task.TaskId,
                                holdRequest.RequestedByEngineerId,
                                teamLeadId,
                                holdRequest.DaysWorkedByEngineer,
                                "Hold request approved - dates transferred from engineer",
                                cancellationToken);

                            holdRequest.DaysTransferredToTl = holdRequest.DaysWorkedByEngineer;
                            holdRequest.ActionTaken = "TransferredToTL";

                            // Task remains OnHold, but assigned to Team Lead
                            task.AssignedEngineer = teamLead.FullName;
                            task.UpdatedAt = reviewDate;
                            task.StatusChangedAt = reviewDate; // BUG FIX: Track status change timestamp

                            await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                            {
                                TaskId = task.TaskId,
                                UpdatedByUserId = teamLeadId,
                                UpdatedByUserName = teamLead.FullName,
                                UpdatedByUserRole = teamLead.Role.ToString(),
                                UpdateType = "HOLD_APPROVED_TRANSFER",
                                FieldName = "AssignedEngineer",
                                OldValue = holdRequest.RequestedByEngineer.FullName,
                                NewValue = teamLead.FullName,
                                UpdateComment = $"Hold approved. {holdRequest.DaysWorkedByEngineer} days transferred to Team Lead. Task remains OnHold. Date counting continues for Team Lead.",
                                UpdatedAt = reviewDate
                            });

                            // Update performance metrics for both engineer and team lead
                            await UpdatePerformanceMetricsAfterTransferAsync(
                                holdRequest.RequestedByEngineerId,
                                teamLeadId,
                                holdRequest.DaysWorkedByEngineer,
                                cancellationToken);
                            
                            _logger.LogInformation("Hold approved with transfer. Task {TaskId} transferred to Team Lead {TeamLeadId} on {ReviewDate}. {Days} days transferred.",
                                task.TaskId, teamLeadId, reviewDate, holdRequest.DaysWorkedByEngineer);
                            break;

                        case "return_to_initiator":
                            // Return task to initiator (creator)
                            holdRequest.ActionTaken = "ReturnedToInitiator";
                            task.Status = TaskStatusEnum.Pending;
                            task.AssignedEngineer = "Unassigned";
                            task.UpdatedAt = reviewDate;
                            task.StatusChangedAt = reviewDate; // BUG FIX: Track status change timestamp

                            await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                            {
                                TaskId = task.TaskId,
                                UpdatedByUserId = teamLeadId,
                                UpdatedByUserName = teamLead.FullName,
                                UpdatedByUserRole = teamLead.Role.ToString(),
                                UpdateType = "HOLD_APPROVED_RETURN",
                                FieldName = "Status",
                                OldValue = "OnHold",
                                NewValue = "Pending",
                                UpdateComment = $"Hold approved. Task returned to initiator for reprocessing. Engineer's {holdRequest.DaysWorkedByEngineer} days recorded but not counted toward TAT.",
                                UpdatedAt = reviewDate
                            });

                            // Notify initiator
                            await _notificationService.NotifyTaskStatusChangeAsync(
                                task.TaskId,
                                "Returned to Pending",
                                teamLead.FullName,
                                cancellationToken);
                            
                            _logger.LogInformation("Hold approved with return to initiator. Task {TaskId} returned to Pending on {ReviewDate}.",
                                task.TaskId, reviewDate);
                            break;

                        case "maintain_status":
                            // Keep task OnHold with current assignment
                            holdRequest.ActionTaken = "MaintainedStatus";

                            await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                            {
                                TaskId = task.TaskId,
                                UpdatedByUserId = teamLeadId,
                                UpdatedByUserName = teamLead.FullName,
                                UpdatedByUserRole = teamLead.Role.ToString(),
                                UpdateType = "HOLD_APPROVED_MAINTAIN",
                                FieldName = "Status",
                                OldValue = "OnHold",
                                NewValue = "OnHold",
                                UpdateComment = $"Hold approved. Status maintained as OnHold. Date counting remains stopped.",
                                UpdatedAt = reviewDate
                            });
                            
                            _logger.LogInformation("Hold approved with maintain status. Task {TaskId} remains OnHold on {ReviewDate}.",
                                task.TaskId, reviewDate);
                            break;

                        default:
                            return ServiceResult<TaskHoldRequestDto>.Failure("Invalid action specified");
                    }
                }
                else if (decision.ToLower() == "reject")
                {
                    holdRequest.Status = "Rejected";
                    holdRequest.ReviewedByTlId = teamLeadId;
                    holdRequest.ReviewDate = reviewDate;
                    holdRequest.ReviewComments = reviewComments;
                    holdRequest.ActionTaken = "MaintainedStatus";

                    // CRITICAL: Restore engineer's date count - DATE COUNTING RESUMES
                    await RestoreEngineerDateCountAsync(
                        task.TaskId,
                        holdRequest.RequestedByEngineerId,
                        holdRequest.DaysWorkedByEngineer,
                        reviewDate,
                        cancellationToken);

                    // Change task status back to InProgress - DATE COUNTING RESUMES
                    task.Status = TaskStatusEnum.InProgress;
                    task.UpdatedAt = reviewDate;
                    task.StatusChangedAt = reviewDate; // BUG FIX: Track status change timestamp

                    await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                    {
                        TaskId = task.TaskId,
                        UpdatedByUserId = teamLeadId,
                        UpdatedByUserName = teamLead.FullName,
                        UpdatedByUserRole = teamLead.Role.ToString(),
                        UpdateType = "HOLD_REJECTED",
                        FieldName = "Status",
                        OldValue = "OnHold",
                        NewValue = "InProgress",
                        UpdateComment = $"Hold request REJECTED. Task returned to InProgress. Engineer's {holdRequest.DaysWorkedByEngineer} days RESTORED. DATE COUNTING RESUMED.",
                        UpdatedAt = reviewDate
                    });

                    // Notify engineer
                    await _notificationService.NotifyTaskStatusChangeAsync(
                        task.TaskId,
                        "Hold Rejected - Returned to InProgress",
                        teamLead.FullName,
                        cancellationToken);
                    
                    _logger.LogInformation("Hold REJECTED. Task {TaskId} returned to InProgress on {ReviewDate}. Engineer {EngineerId} days RESTORED: {Days}. Date counting RESUMED.",
                        task.TaskId, reviewDate, holdRequest.RequestedByEngineerId, holdRequest.DaysWorkedByEngineer);
                }
                else
                {
                    return ServiceResult<TaskHoldRequestDto>.Failure("Invalid decision. Must be 'approve' or 'reject'");
                }

                holdRequest.UpdatedAt = reviewDate;
                await _context.SaveChangesAsync(cancellationToken);

                var dto = MapToDto(holdRequest, task, holdRequest.RequestedByEngineer, teamLead);
                return ServiceResult<TaskHoldRequestDto>.Success(dto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reviewing hold request {HoldRequestId}", holdRequestId);
                return ServiceResult<TaskHoldRequestDto>.Failure($"Error reviewing hold request: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<List<TaskHoldRequestDto>>> GetPendingHoldRequestsAsync(
            int? teamLeadId = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var query = _context.Set<TaskHoldRequest>()
                    .Include(hr => hr.Task)
                        .ThenInclude(t => t.Category)
                    .Include(hr => hr.RequestedByEngineer)
                    .Include(hr => hr.ReviewedByTl)
                    .Where(hr => hr.Status == "PendingApproval" && hr.RecordStatus == RecordStatus.Active);

                var holdRequests = await query
                    .OrderByDescending(hr => hr.HoldRequestedDate)
                    .ToListAsync(cancellationToken);

                var dtos = holdRequests.Select(hr => MapToDto(hr, hr.Task, hr.RequestedByEngineer, hr.ReviewedByTl)).ToList();
                return ServiceResult<List<TaskHoldRequestDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting pending hold requests");
                return ServiceResult<List<TaskHoldRequestDto>>.Failure($"Error getting pending hold requests: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<List<TaskHoldRequestDto>>> GetHoldRequestsByTaskIdAsync(
            int taskId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var holdRequests = await _context.Set<TaskHoldRequest>()
                    .Include(hr => hr.Task)
                        .ThenInclude(t => t.Category)
                    .Include(hr => hr.RequestedByEngineer)
                    .Include(hr => hr.ReviewedByTl)
                    .Where(hr => hr.TaskId == taskId && hr.RecordStatus == RecordStatus.Active)
                    .OrderByDescending(hr => hr.HoldRequestedDate)
                    .ToListAsync(cancellationToken);

                var dtos = holdRequests.Select(hr => MapToDto(hr, hr.Task, hr.RequestedByEngineer, hr.ReviewedByTl)).ToList();
                return ServiceResult<List<TaskHoldRequestDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting hold requests for task {TaskId}", taskId);
                return ServiceResult<List<TaskHoldRequestDto>>.Failure($"Error getting hold requests: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<List<UserDateCountDto>>> GetUserDateCountsAsync(
            int userId,
            int? taskId = null,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var query = _context.Set<UserDateCount>()
                    .Include(udc => udc.User)
                    .Include(udc => udc.Task)
                    .Include(udc => udc.TransferredFromUser)
                    .Where(udc => udc.UserId == userId && udc.RecordStatus == RecordStatus.Active);

                if (taskId.HasValue)
                {
                    query = query.Where(udc => udc.TaskId == taskId.Value);
                }

                var dateCounts = await query
                    .OrderByDescending(udc => udc.CreatedAt)
                    .ToListAsync(cancellationToken);

                var dtos = dateCounts.Select(udc => new UserDateCountDto
                {
                    DateCountId = udc.DateCountId,
                    UserId = udc.UserId,
                    UserName = udc.User.FullName,
                    TaskId = udc.TaskId,
                    TaskDescription = udc.Task.Description,
                    DateCount = udc.DateCount,
                    CountType = udc.CountType,
                    StartDate = udc.StartDate,
                    EndDate = udc.EndDate,
                    TransferredFromUserId = udc.TransferredFromUserId,
                    TransferredFromUserName = udc.TransferredFromUser?.FullName,
                    TransferReason = udc.TransferReason,
                    CreatedAt = udc.CreatedAt
                }).ToList();

                return ServiceResult<List<UserDateCountDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting date counts for user {UserId}", userId);
                return ServiceResult<List<UserDateCountDto>>.Failure($"Error getting date counts: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<int>> CalculateDaysWorkedAsync(
            int taskId,
            int engineerId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var days = await CalculateDaysWorkedInternalAsync(taskId, engineerId, cancellationToken);
                return ServiceResult<int>.Success(days);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating days worked for task {TaskId} and engineer {EngineerId}", taskId, engineerId);
                return ServiceResult<int>.Failure($"Error calculating days worked: {ex.Message}");
            }
        }

        public async System.Threading.Tasks.Task<ServiceResult<List<int>>> GetTaskIdsByEngineerHoldRequestsAsync(
            int engineerId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var taskIds = await _context.Set<TaskHoldRequest>()
                    .Where(hr => hr.RequestedByEngineerId == engineerId && hr.RecordStatus == RecordStatus.Active)
                    .Select(hr => hr.TaskId)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                _logger.LogInformation("Found {Count} distinct task IDs with hold requests from engineer {EngineerId}", 
                    taskIds.Count, engineerId);

                return ServiceResult<List<int>>.Success(taskIds);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting task IDs by engineer hold requests for engineer {EngineerId}", engineerId);
                return ServiceResult<List<int>>.Failure($"Error getting task IDs: {ex.Message}");
            }
        }

        #region Private Helper Methods

        private async System.Threading.Tasks.Task<int> CalculateDaysWorkedInternalAsync(int taskId, int engineerId, CancellationToken cancellationToken)
        {
            // Get the date when engineer was assigned
            var assignmentDate = await GetEngineerAssignmentDateAsync(taskId, engineerId, cancellationToken);
            
            if (!assignmentDate.HasValue)
            {
                return 0;
            }

            // Calculate business days between assignment and now
            var days = CalculateBusinessDays(assignmentDate.Value, DateTime.UtcNow);
            return days;
        }

        private async System.Threading.Tasks.Task<DateTime?> GetEngineerAssignmentDateAsync(int taskId, int engineerId, CancellationToken cancellationToken)
        {
            var engineer = await _context.Users.FindAsync(engineerId);
            if (engineer == null) return null;

            // Look for the most recent assignment in update history
            var assignmentHistory = await _context.Set<TaskUpdateHistory>()
                .Where(h => h.TaskId == taskId && 
                           h.FieldName == "AssignedEngineer" && 
                           h.NewValue != null && h.NewValue.Contains(engineer.FullName))
                .OrderByDescending(h => h.UpdatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            return assignmentHistory?.UpdatedAt ?? DateTime.UtcNow;
        }

        private int CalculateBusinessDays(DateTime startDate, DateTime endDate)
        {
            int businessDays = 0;
            DateTime current = startDate.Date;

            while (current <= endDate.Date)
            {
                if (current.DayOfWeek != DayOfWeek.Saturday && current.DayOfWeek != DayOfWeek.Sunday)
                {
                    businessDays++;
                }
                current = current.AddDays(1);
            }

            return businessDays;
        }

        private async System.Threading.Tasks.Task ResetEngineerDateCountAsync(int taskId, int engineerId, int previousDays, DateTime onHoldDate, CancellationToken cancellationToken)
        {
            // Find existing date count record
            var existingCount = await _context.Set<UserDateCount>()
                .FirstOrDefaultAsync(udc => udc.TaskId == taskId && udc.UserId == engineerId, cancellationToken);

            if (existingCount != null)
            {
                // Update to zero and set end date to OnHold date
                existingCount.DateCount = 0;
                existingCount.EndDate = onHoldDate; // CRITICAL: Record when counting stopped
                existingCount.UpdatedAt = onHoldDate;
            }
            else
            {
                // Create new record with zero
                var newCount = new UserDateCount
                {
                    UserId = engineerId,
                    TaskId = taskId,
                    DateCount = 0,
                    CountType = "WorkDays",
                    StartDate = onHoldDate,
                    EndDate = onHoldDate, // CRITICAL: Record when counting stopped
                    CreatedAt = onHoldDate,
                    UpdatedAt = onHoldDate,
                    RegisteredBy = "System",
                    RegisteredDate = onHoldDate,
                    TimeZoneInfo = "UTC",
                    RecordStatus = RecordStatus.Active,
                    IsReadOnly = false
                };
                _context.Set<UserDateCount>().Add(newCount);
            }

            await _context.SaveChangesAsync(cancellationToken);
            
            _logger.LogInformation("Engineer {EngineerId} date count reset to 0 for task {TaskId} on {OnHoldDate}. Previous days: {Days}",
                engineerId, taskId, onHoldDate, previousDays);
        }

        private async System.Threading.Tasks.Task RestoreEngineerDateCountAsync(int taskId, int engineerId, int daysToRestore, DateTime resumeDate, CancellationToken cancellationToken)
        {
            var existingCount = await _context.Set<UserDateCount>()
                .FirstOrDefaultAsync(udc => udc.TaskId == taskId && udc.UserId == engineerId, cancellationToken);

            if (existingCount != null)
            {
                existingCount.DateCount = daysToRestore;
                existingCount.EndDate = null; // CRITICAL: Resume counting (no end date)
                existingCount.UpdatedAt = resumeDate;
            }
            else
            {
                var newCount = new UserDateCount
                {
                    UserId = engineerId,
                    TaskId = taskId,
                    DateCount = daysToRestore,
                    CountType = "WorkDays",
                    StartDate = resumeDate.AddDays(-daysToRestore),
                    EndDate = null, // CRITICAL: Resume counting (no end date)
                    CreatedAt = resumeDate,
                    UpdatedAt = resumeDate,
                    RegisteredBy = "System",
                    RegisteredDate = resumeDate,
                    TimeZoneInfo = "UTC",
                    RecordStatus = RecordStatus.Active,
                    IsReadOnly = false
                };
                _context.Set<UserDateCount>().Add(newCount);
            }

            await _context.SaveChangesAsync(cancellationToken);
            
            _logger.LogInformation("Engineer {EngineerId} date count RESTORED to {Days} for task {TaskId} on {ResumeDate}. Date counting RESUMED.",
                engineerId, daysToRestore, taskId, resumeDate);
        }

        private async System.Threading.Tasks.Task TransferDateCountToTeamLeadAsync(
            int taskId,
            int fromEngineerId,
            int toTeamLeadId,
            int daysToTransfer,
            string reason,
            CancellationToken cancellationToken)
        {
            var transferDate = DateTime.UtcNow;
            
            // Create new date count record for Team Lead
            var tlDateCount = new UserDateCount
            {
                UserId = toTeamLeadId,
                TaskId = taskId,
                DateCount = daysToTransfer,
                CountType = "TransferredFromEngineer",
                StartDate = transferDate,
                EndDate = null, // Team Lead can continue working
                TransferredFromUserId = fromEngineerId,
                TransferReason = reason,
                CreatedAt = transferDate,
                UpdatedAt = transferDate,
                RegisteredBy = "System",
                RegisteredDate = transferDate,
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.Set<UserDateCount>().Add(tlDateCount);
            await _context.SaveChangesAsync(cancellationToken);
            
            _logger.LogInformation("{Days} days transferred from Engineer {FromId} to Team Lead {ToId} for task {TaskId} on {TransferDate}",
                daysToTransfer, fromEngineerId, toTeamLeadId, taskId, transferDate);
        }

        private async System.Threading.Tasks.Task UpdatePerformanceMetricsAfterTransferAsync(
            int engineerId,
            int teamLeadId,
            int daysTransferred,
            CancellationToken cancellationToken)
        {
            // Update or create performance metrics for engineer
            var engineerMetric = await _context.Set<PerformanceMetric>()
                .FirstOrDefaultAsync(pm => pm.UserId == engineerId, cancellationToken);

            if (engineerMetric == null)
            {
                engineerMetric = new PerformanceMetric
                {
                    UserId = engineerId,
                    TasksCompleted = 0,
                    TasksOnTime = 0,
                    TasksOverdue = 0,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    RegisteredBy = "System",
                    RegisteredDate = DateTime.UtcNow,
                    StartDate = DateTime.UtcNow,
                    EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                    TimeZoneInfo = "UTC",
                    RecordStatus = RecordStatus.Active,
                    IsReadOnly = false
                };
                _context.Set<PerformanceMetric>().Add(engineerMetric);
            }

            engineerMetric.LastCalculatedAt = DateTime.UtcNow;
            engineerMetric.UpdatedAt = DateTime.UtcNow;

            // Update or create performance metrics for team lead
            var teamLeadMetric = await _context.Set<PerformanceMetric>()
                .FirstOrDefaultAsync(pm => pm.UserId == teamLeadId, cancellationToken);

            if (teamLeadMetric == null)
            {
                teamLeadMetric = new PerformanceMetric
                {
                    UserId = teamLeadId,
                    TasksCompleted = 0,
                    TasksOnTime = 0,
                    TasksOverdue = 0,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    RegisteredBy = "System",
                    RegisteredDate = DateTime.UtcNow,
                    StartDate = DateTime.UtcNow,
                    EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                    TimeZoneInfo = "UTC",
                    RecordStatus = RecordStatus.Active,
                    IsReadOnly = false
                };
                _context.Set<PerformanceMetric>().Add(teamLeadMetric);
            }

            teamLeadMetric.LastCalculatedAt = DateTime.UtcNow;
            teamLeadMetric.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
        }

        private TaskHoldRequestDto MapToDto(TaskHoldRequest holdRequest, TaskEntity task, User engineer, User? teamLead = null)
        {
            return new TaskHoldRequestDto
            {
                HoldRequestId = holdRequest.HoldRequestId,
                TaskId = holdRequest.TaskId,
                TaskDescription = task.Description,
                SerialNumber = task.SerialNumber ?? "",
                RequestedByEngineerId = holdRequest.RequestedByEngineerId,
                RequestedByEngineerName = engineer.FullName,
                HoldReason = holdRequest.HoldReason,
                DaysWorkedByEngineer = holdRequest.DaysWorkedByEngineer,
                AssignedDate = holdRequest.AssignedDate,
                HoldRequestedDate = holdRequest.HoldRequestedDate,
                Status = holdRequest.Status,
                ReviewedByTlId = holdRequest.ReviewedByTlId,
                ReviewedByTlName = teamLead?.FullName,
                ReviewDate = holdRequest.ReviewDate,
                ReviewComments = holdRequest.ReviewComments,
                DaysTransferredToTl = holdRequest.DaysTransferredToTl,
                ActionTaken = holdRequest.ActionTaken,
                CreatedAt = holdRequest.CreatedAt,
                UpdatedAt = holdRequest.UpdatedAt,
                StatusChangedAt = task.StatusChangedAt // BUG FIX: Include status change timestamp
            };
        }

        #endregion
    }
}