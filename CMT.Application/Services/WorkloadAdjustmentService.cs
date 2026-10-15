using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskEntity = CMT.Domain.Models.Task;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using DomainUserRole = CMT.Domain.Models.UserRole;

namespace CMT.Application.Services
{
    /// <summary>
    /// Implements workload adjustment request workflow:
    /// 1. Engineer reviews assigned task and determines additional time is needed.
    /// 2. Engineer submits a workload adjustment request specifying ADDITIONAL hours or days needed.
    ///    Engineers can request any positive number of hours or days directly.
    ///    When "days" is selected, the value is converted: requested_days × 7.25 = additional hours.
    /// 3. Team Leader receives notification and reviews the request.
    /// 4. If approved: the additional hours are added to the task's current estimated hours
    ///    (AdjustedEstimatedHours = original + approved additional hours) AND TargetCompletionDate
    ///    is extended by the approved additional hours (using 7.25h/day, skipping weekends).
    /// 5. If rejected: task keeps original EstimatedHours and TargetCompletionDate, engineer proceeds as assigned.
    /// </summary>
    public class WorkloadAdjustmentService : IWorkloadAdjustmentService
    {
        private readonly ApplicationDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ILogger<WorkloadAdjustmentService> _logger;

        // EAT schedule constant: net working hours per day (same as ScheduleService and WorkloadService)
        private const decimal NetWorkHoursPerDay = 7.25m;

        public WorkloadAdjustmentService(
            ApplicationDbContext context,
            INotificationService notificationService,
            ILogger<WorkloadAdjustmentService> logger)
        {
            _context = context;
            _notificationService = notificationService;
            _logger = logger;
        }

        /// <summary>
        /// Converts a value from the given unit to hours.
        /// If unit is "days", multiplies by NetWorkHoursPerDay (7.25).
        /// If unit is "hours" or anything else, returns the value as-is.
        /// </summary>
        private static decimal ConvertToHours(decimal value, string unit)
        {
            if (string.Equals(unit, "days", StringComparison.OrdinalIgnoreCase))
                return Math.Round(value * NetWorkHoursPerDay, 2);
            return value;
        }

        /// <summary>
        /// Recalculates the TargetCompletionDate by extending it based on the approved additional hours.
        /// Uses the EAT schedule: 7.25 net hours per working day, skipping weekends.
        /// The additionalHours value is always positive (represents extra time granted).
        /// 
        /// This method adds the EXACT hours to the target date:
        ///   - First, it calculates how many full working days and remaining hours are in the additional time.
        ///   - Full working days are added by skipping weekends.
        ///   - Remaining fractional hours are added directly to the time component.
        ///   - If adding the remaining hours pushes past end-of-working-day, it rolls over to the next working day.
        /// 
        /// Examples:
        ///   - 1 hour additional  → extends target by exactly 1 hour (same day if within working hours)
        ///   - 7.25 hours         → extends target by exactly 1 working day
        ///   - 14.5 hours (2 days)→ extends target by exactly 2 working days
        ///   - 10 hours           → extends target by 1 working day + 2.75 hours
        /// </summary>
        private static DateTime CalculateNewTargetCompletionDate(
            DateTime currentTarget, decimal additionalHours)
        {
            if (additionalHours <= 0)
                return currentTarget;

            // Calculate full working days and remaining hours
            var fullWorkingDays = (int)(additionalHours / NetWorkHoursPerDay);
            var remainingHours = additionalHours % NetWorkHoursPerDay;

            var newDate = currentTarget;

            // Add full working days, skipping weekends
            var daysAdded = 0;
            while (daysAdded < fullWorkingDays)
            {
                newDate = newDate.AddDays(1);
                if (newDate.DayOfWeek != DayOfWeek.Saturday && newDate.DayOfWeek != DayOfWeek.Sunday)
                    daysAdded++;
            }

            // Add remaining fractional hours directly to the time
            if (remainingHours > 0)
            {
                var hoursToAdd = (double)remainingHours;
                newDate = newDate.AddHours(hoursToAdd);

                // If the addition lands on a weekend, advance to next Monday same time
                while (newDate.DayOfWeek == DayOfWeek.Saturday || newDate.DayOfWeek == DayOfWeek.Sunday)
                {
                    newDate = newDate.AddDays(1);
                }
            }

            return newDate;
        }

        public async Task<ServiceResult<WorkloadAdjustmentRequestDto>> CreateAdjustmentRequestAsync(
            int requesterId,
            CreateWorkloadAdjustmentDto request,
            CancellationToken cancellationToken = default)
        {
            try
            {
                // Determine the unit and convert to hours if needed.
                // The engineer enters ADDITIONAL time needed (e.g. 2 days or 14.5 hours).
                // If unit is "days", convert: requested_days × 7.25 = additional hours.
                var requestUnit = string.IsNullOrWhiteSpace(request.RequestUnit) ? "hours" : request.RequestUnit.ToLower();
                var rawValue = request.RequestedEstimatedHours; // The raw value entered by the engineer
                var additionalHours = ConvertToHours(rawValue, requestUnit);

                _logger.LogInformation(
                    "Engineer {RequesterId} creating workload adjustment for task {TaskId}: requesting additional {RawValue} {Unit} ({AdditionalHours}h)",
                    requesterId, request.TaskId, rawValue, requestUnit, additionalHours);

                // Validate requester exists and is an engineer
                var requester = await _context.Users.FindAsync(new object[] { requesterId }, cancellationToken);
                if (requester == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure("Requester not found");

                if (requester.Role != DomainUserRole.Engineer)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "Only engineers can request workload adjustments");

                // Validate task exists and is assigned to this engineer
                var task = await _context.Tasks
                    .Include(t => t.Priority)
                    .Include(t => t.Category)
                    .FirstOrDefaultAsync(t => t.TaskId == request.TaskId &&
                                              t.RecordStatus == RecordStatus.Active, cancellationToken);

                if (task == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure("Task not found");

                if (string.IsNullOrEmpty(task.AssignedEngineer) ||
                    !task.AssignedEngineer.Contains(requester.FullName, StringComparison.OrdinalIgnoreCase))
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "You can only request workload adjustments for tasks assigned to you");

                // Task must be in an active state (not completed, cancelled, or rejected)
                if (task.Status == DomainTaskStatus.Completed ||
                    task.Status == DomainTaskStatus.Cancelled ||
                    task.Status == DomainTaskStatus.Rejected)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        $"Cannot request workload adjustment for a task with status '{task.Status}'");

                // Check for existing pending request on this task by this engineer
                var existingPending = await _context.Set<WorkloadAdjustmentRequest>()
                    .AnyAsync(war => war.TaskId == request.TaskId &&
                                     war.RequesterId == requesterId &&
                                     war.Status == "PendingTLReview" &&
                                     war.RecordStatus == RecordStatus.Active, cancellationToken);

                if (existingPending)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "There is already a pending workload adjustment request for this task");

                // Use AdjustedEstimatedHours if a previous adjustment was approved, otherwise EstimatedHours
                var currentHours = task.AdjustedEstimatedHours ?? task.EstimatedHours ?? 8m;

                // Create the adjustment request.
                // RequestedEstimatedHours stores the ADDITIONAL hours (converted to hours).
                // RequestedRawValue stores the original value the engineer entered (for display).
                var adjustmentRequest = new WorkloadAdjustmentRequest
                {
                    TaskId = request.TaskId,
                    RequesterId = requesterId,
                    OriginalEstimatedHours = currentHours,
                    RequestedEstimatedHours = additionalHours,
                    RequestedRawValue = rawValue,
                    RequestReason = request.RequestReason,
                    RequestUnit = requestUnit,
                    Status = "PendingTLReview",
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

                _context.Set<WorkloadAdjustmentRequest>().Add(adjustmentRequest);
                await _context.SaveChangesAsync(cancellationToken);

                _logger.LogInformation(
                    "Workload adjustment request {AdjustmentRequestId} created for task {TaskId} by engineer {EngineerName}: " +
                    "current {CurrentHours}h + additional {AdditionalHours}h (requested as {RawValue} {Unit}) = {NewTotal}h total",
                    adjustmentRequest.AdjustmentRequestId, request.TaskId, requester.FullName,
                    currentHours, additionalHours, rawValue, requestUnit, currentHours + additionalHours);

                // Notify Team Leaders
                var unitLabel = requestUnit == "days"
                    ? $"{rawValue} day(s) ({additionalHours}h)"
                    : $"{additionalHours}h";
                await _notificationService.NotifyByRoleAsync(
                    DomainUserRole.TeamLeader,
                    $"Workload adjustment requested by {requester.FullName} for Task TC-{request.TaskId}: " +
                    $"additional {unitLabel} requested (current: {currentHours}h). " +
                    $"Reason: {request.RequestReason.Substring(0, Math.Min(100, request.RequestReason.Length))}",
                    "WorkloadAdjustment",
                    "High",
                    request.TaskId,
                    cancellationToken);

                var dto = MapToDto(adjustmentRequest, task, requester, null);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Success(dto,
                    "Workload adjustment request submitted successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating workload adjustment request for task {TaskId}", request.TaskId);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                    $"Error creating workload adjustment request: {ex.Message}");
            }
        }

        public async Task<ServiceResult<WorkloadAdjustmentRequestDto>> ReviewAdjustmentRequestAsync(
            int adjustmentRequestId,
            int reviewerId,
            ReviewWorkloadAdjustmentDto review,
            CancellationToken cancellationToken = default)
        {
            try
            {
                _logger.LogInformation(
                    "Reviewer {ReviewerId} reviewing workload adjustment {AdjustmentRequestId}: decision={Decision}",
                    reviewerId, adjustmentRequestId, review.Decision);

                // Validate reviewer exists and is a Team Leader
                var reviewer = await _context.Users.FindAsync(new object[] { reviewerId }, cancellationToken);
                if (reviewer == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure("Reviewer not found");

                if (reviewer.Role != DomainUserRole.TeamLeader)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "Only Team Leaders can review workload adjustment requests");

                // Get the adjustment request
                var adjustmentRequest = await _context.Set<WorkloadAdjustmentRequest>()
                    .Include(war => war.Requester)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Priority)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Category)
                    .FirstOrDefaultAsync(war => war.AdjustmentRequestId == adjustmentRequestId &&
                                                 war.RecordStatus == RecordStatus.Active, cancellationToken);

                if (adjustmentRequest == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "Workload adjustment request not found");

                if (adjustmentRequest.Status != "PendingTLReview")
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        $"This request has already been reviewed (status: {adjustmentRequest.Status})");

                var task = adjustmentRequest.Task;
                if (task == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure("Associated task not found");

                // Process decision
                var decision = review.Decision.ToLower();
                if (decision == "approve")
                {
                    // Determine the approved ADDITIONAL hours.
                    // TL can override with a partial approval (fewer additional hours than requested).
                    // Convert from the TL's specified unit if needed.
                    var approvedUnit = string.IsNullOrWhiteSpace(review.ApprovedUnit) ? "hours" : review.ApprovedUnit.ToLower();
                    var approvedAdditionalHours = review.ApprovedEstimatedHours.HasValue
                        ? ConvertToHours(review.ApprovedEstimatedHours.Value, approvedUnit)
                        : adjustmentRequest.RequestedEstimatedHours;

                    // The approved additional hours must be positive
                    if (approvedAdditionalHours <= 0)
                        return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                            "Approved additional hours must be greater than 0");

                    adjustmentRequest.Status = "Approved";
                    adjustmentRequest.ApprovedEstimatedHours = approvedAdditionalHours;

                    // ═══════════════════════════════════════════════════════════════════
                    // UPDATE THE TASK'S ADJUSTED ESTIMATED HOURS
                    // New total = original hours + approved additional hours.
                    // AdjustedEstimatedHours overrides EstimatedHours for workload and
                    // performance calculations. The original EstimatedHours is preserved.
                    // WorkloadService uses: AdjustedEstimatedHours ?? EstimatedHours ?? 8m
                    // ═══════════════════════════════════════════════════════════════════
                    var newTotalHours = adjustmentRequest.OriginalEstimatedHours + approvedAdditionalHours;
                    task.AdjustedEstimatedHours = newTotalHours;
                    task.UpdatedAt = DateTime.UtcNow;

                    // ═══════════════════════════════════════════════════════════════════
                    // RECALCULATE TARGET COMPLETION DATE
                    // The approved additional hours are applied DIRECTLY to extend the
                    // TargetCompletionDate. The additional hours represent extra working
                    // time, converted to working days (7.25h/day), skipping weekends.
                    // Example: 14.5 additional hours = 2 working days extension.
                    // ═══════════════════════════════════════════════════════════════════
                    var previousTargetDate = task.TargetCompletionDate;

                    if (previousTargetDate.HasValue)
                    {
                        var newTargetDate = CalculateNewTargetCompletionDate(
                            previousTargetDate.Value, approvedAdditionalHours);
                        task.TargetCompletionDate = newTargetDate;

                        // Store the date change in the adjustment request for audit trail
                        adjustmentRequest.PreviousTargetCompletionDate = previousTargetDate;
                        adjustmentRequest.NewTargetCompletionDate = newTargetDate;

                        var fullDays = (int)(approvedAdditionalHours / NetWorkHoursPerDay);
                        var remainingHrs = approvedAdditionalHours % NetWorkHoursPerDay;
                        _logger.LogInformation(
                            "TargetCompletionDate extended for task {TaskId}: {OldDate:yyyy-MM-dd HH:mm} → {NewDate:yyyy-MM-dd HH:mm} " +
                            "(+{AdditionalHours}h = {FullDays} working day(s) + {RemainingHours}h)",
                            task.TaskId,
                            previousTargetDate.Value,
                            newTargetDate,
                            approvedAdditionalHours,
                            fullDays,
                            remainingHrs);
                    }
                    else
                    {
                        // If no TargetCompletionDate was set, use EstimatedCompletionDate as the base
                        var baseDate = task.EstimatedCompletionDate;
                        var newTargetDate = CalculateNewTargetCompletionDate(
                            baseDate, approvedAdditionalHours);
                        task.TargetCompletionDate = newTargetDate;

                        adjustmentRequest.PreviousTargetCompletionDate = null;
                        adjustmentRequest.NewTargetCompletionDate = newTargetDate;

                        _logger.LogInformation(
                            "TargetCompletionDate set for task {TaskId} (was null): {NewDate:yyyy-MM-dd} " +
                            "(based on EstimatedCompletionDate {BaseDate:yyyy-MM-dd} + {AdditionalHours}h)",
                            task.TaskId, newTargetDate, baseDate, approvedAdditionalHours);
                    }

                    _logger.LogInformation(
                        "Workload adjustment APPROVED for task {TaskId}: {OriginalHours}h + {ApprovedAdditionalHours}h = {NewTotalHours}h. " +
                        "TargetCompletionDate: {PrevTarget} → {NewTarget}",
                        task.TaskId, adjustmentRequest.OriginalEstimatedHours, approvedAdditionalHours,
                        newTotalHours,
                        adjustmentRequest.PreviousTargetCompletionDate?.ToString("yyyy-MM-dd") ?? "N/A",
                        adjustmentRequest.NewTargetCompletionDate?.ToString("yyyy-MM-dd") ?? "N/A");
                }
                else if (decision == "reject")
                {
                    adjustmentRequest.Status = "Rejected";

                    _logger.LogInformation(
                        "Workload adjustment REJECTED for task {TaskId}. Original hours ({OriginalHours}h) remain unchanged.",
                        task.TaskId, adjustmentRequest.OriginalEstimatedHours);
                }
                else
                {
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "Invalid decision. Must be 'approve' or 'reject'");
                }

                // Update review fields
                adjustmentRequest.ReviewedByTlId = reviewerId;
                adjustmentRequest.TlReviewDate = DateTime.UtcNow;
                adjustmentRequest.TlReviewComments = review.ReviewComments;
                adjustmentRequest.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync(cancellationToken);

                // Notify the requesting engineer
                var statusText = decision == "approve" ? "approved" : "rejected";
                var notificationDetail = decision == "approve"
                    ? $" Additional {adjustmentRequest.ApprovedEstimatedHours}h approved. " +
                      $"New total: {task.AdjustedEstimatedHours}h." +
                      (adjustmentRequest.NewTargetCompletionDate.HasValue
                          ? $" Target completion date updated to {adjustmentRequest.NewTargetCompletionDate.Value:dd MMM yyyy}."
                          : "")
                    : $" Original hours ({adjustmentRequest.OriginalEstimatedHours}h) remain unchanged.";

                var notification = new CMT.Domain.Models.Notification
                {
                    UserId = adjustmentRequest.RequesterId,
                    Message = $"Your workload adjustment request for Task TC-{task.TaskId} has been {statusText} by {reviewer.FullName}.{notificationDetail}",
                    NotificationType = "WorkloadAdjustment",
                    Priority = "High",
                    TaskId = task.TaskId,
                    ActionUrl = $"/tasks/{task.TaskId}",
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow
                };

                _context.Notifications.Add(notification);
                await _context.SaveChangesAsync(cancellationToken);

                var dto = MapToDto(adjustmentRequest, task, adjustmentRequest.Requester, reviewer);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Success(dto,
                    $"Workload adjustment request {statusText} successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reviewing workload adjustment request {AdjustmentRequestId}",
                    adjustmentRequestId);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                    $"Error reviewing workload adjustment request: {ex.Message}");
            }
        }

        public async Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetPendingAdjustmentRequestsAsync(
            CancellationToken cancellationToken = default)
        {
            try
            {
                var requests = await _context.Set<WorkloadAdjustmentRequest>()
                    .Include(war => war.Requester)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Priority)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Category)
                    .Include(war => war.ReviewedByTl)
                    .Where(war => war.Status == "PendingTLReview" &&
                                  war.RecordStatus == RecordStatus.Active)
                    .OrderByDescending(war => war.CreatedAt)
                    .ToListAsync(cancellationToken);

                var dtos = requests.Select(war => MapToDto(war, war.Task, war.Requester, war.ReviewedByTl)).ToList();
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting pending workload adjustment requests");
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Failure(
                    $"Error getting pending requests: {ex.Message}");
            }
        }

        public async Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetAdjustmentRequestsByEngineerAsync(
            int engineerId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var requests = await _context.Set<WorkloadAdjustmentRequest>()
                    .Include(war => war.Requester)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Priority)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Category)
                    .Include(war => war.ReviewedByTl)
                    .Where(war => war.RequesterId == engineerId &&
                                  war.RecordStatus == RecordStatus.Active)
                    .OrderByDescending(war => war.CreatedAt)
                    .ToListAsync(cancellationToken);

                var dtos = requests.Select(war => MapToDto(war, war.Task, war.Requester, war.ReviewedByTl)).ToList();
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting workload adjustment requests for engineer {EngineerId}", engineerId);
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Failure(
                    $"Error getting requests: {ex.Message}");
            }
        }

        public async Task<ServiceResult<List<WorkloadAdjustmentRequestDto>>> GetAdjustmentRequestsByTaskAsync(
            int taskId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var requests = await _context.Set<WorkloadAdjustmentRequest>()
                    .Include(war => war.Requester)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Priority)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Category)
                    .Include(war => war.ReviewedByTl)
                    .Where(war => war.TaskId == taskId &&
                                  war.RecordStatus == RecordStatus.Active)
                    .OrderByDescending(war => war.CreatedAt)
                    .ToListAsync(cancellationToken);

                var dtos = requests.Select(war => MapToDto(war, war.Task, war.Requester, war.ReviewedByTl)).ToList();
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Success(dtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting workload adjustment requests for task {TaskId}", taskId);
                return ServiceResult<List<WorkloadAdjustmentRequestDto>>.Failure(
                    $"Error getting requests: {ex.Message}");
            }
        }

        public async Task<ServiceResult<WorkloadAdjustmentRequestDto>> GetAdjustmentRequestByIdAsync(
            int adjustmentRequestId,
            CancellationToken cancellationToken = default)
        {
            try
            {
                var request = await _context.Set<WorkloadAdjustmentRequest>()
                    .Include(war => war.Requester)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Priority)
                    .Include(war => war.Task)
                        .ThenInclude(t => t.Category)
                    .Include(war => war.ReviewedByTl)
                    .FirstOrDefaultAsync(war => war.AdjustmentRequestId == adjustmentRequestId &&
                                                 war.RecordStatus == RecordStatus.Active, cancellationToken);

                if (request == null)
                    return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                        "Workload adjustment request not found");

                var dto = MapToDto(request, request.Task, request.Requester, request.ReviewedByTl);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Success(dto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting workload adjustment request {AdjustmentRequestId}",
                    adjustmentRequestId);
                return ServiceResult<WorkloadAdjustmentRequestDto>.Failure(
                    $"Error getting request: {ex.Message}");
            }
        }

        #region Private Helper Methods

        private static WorkloadAdjustmentRequestDto MapToDto(
            WorkloadAdjustmentRequest entity,
            TaskEntity task,
            User requester,
            User? reviewer)
        {
            return new WorkloadAdjustmentRequestDto
            {
                AdjustmentRequestId = entity.AdjustmentRequestId,
                TaskId = entity.TaskId,
                TaskDescription = task?.Description ?? "N/A",
                SerialNumber = task?.SerialNumber ?? "",
                PartNumber = task?.PartNumber ?? "",
                AssignedEngineer = task?.AssignedEngineer ?? "",
                RequesterId = entity.RequesterId,
                RequesterName = requester?.FullName ?? "Unknown",
                OriginalEstimatedHours = entity.OriginalEstimatedHours,
                RequestedEstimatedHours = entity.RequestedEstimatedHours,
                RequestedRawValue = entity.RequestedRawValue,
                RequestUnit = entity.RequestUnit ?? "hours",
                RequestReason = entity.RequestReason,
                Status = entity.Status,
                ReviewedByTlId = entity.ReviewedByTlId,
                ReviewerName = reviewer?.FullName,
                TlReviewDate = entity.TlReviewDate,
                TlReviewComments = entity.TlReviewComments,
                ApprovedEstimatedHours = entity.ApprovedEstimatedHours,
                PreviousTargetCompletionDate = entity.PreviousTargetCompletionDate,
                NewTargetCompletionDate = entity.NewTargetCompletionDate,
                CreatedAt = entity.CreatedAt,
                UpdatedAt = entity.UpdatedAt
            };
        }

        #endregion
    }
}