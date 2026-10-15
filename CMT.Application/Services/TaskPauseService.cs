using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Enums;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public class TaskPauseService : ITaskPauseService
    {
        private readonly ApplicationDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ILogger<TaskPauseService> _logger;

        public TaskPauseService(ApplicationDbContext context, INotificationService notificationService, ILogger<TaskPauseService> logger)
        {
            _context = context;
            _notificationService = notificationService;
            _logger = logger;
        }

        public async Task<ServiceResult<TaskPauseHistoryDto>> PauseTaskAsync(
            int taskId, int userId, string pauseReason, CancellationToken cancellationToken = default)
        {
            try
            {
                var task = await _context.Tasks
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

                if (task == null)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Task not found");
                }

                if (task.IsPaused)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Task is already paused");
                }

                if (task.Status == TaskStatus.Completed || task.Status == TaskStatus.Rejected)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Cannot pause a completed or rejected task");
                }

                var previousStatus = task.Status;

                // Update task fields
                task.IsPaused = true;
                task.PausedAt = DateTime.UtcNow;
                task.PausedReason = pauseReason;
                task.PausedBy = userId;
                task.Status = TaskStatus.Paused;
                task.UpdatedAt = DateTime.UtcNow;
                task.StatusChangedAt = DateTime.UtcNow; // BUG FIX: Track when status changed for overdue calculations

                // Create update history entry
                var historyEntry = new TaskUpdateHistory
                {
                    TaskId = taskId,
                    UpdatedByUserId = userId,
                    UpdateType = "StatusChange",
                    FieldName = "Status",
                    OldValue = previousStatus.ToString(),
                    NewValue = "Paused",
                    UpdateComment = $"[PAUSED] {pauseReason}",
                    UpdatedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };

                _context.TaskUpdateHistories.Add(historyEntry);
                await _context.SaveChangesAsync(cancellationToken);

                // CRITICAL FIX: Notify the task initiator (creator) and relevant parties when a task is paused
                var pausedByUser = await _context.Users.FindAsync(new object[] { userId }, cancellationToken);
                var pausedByName = pausedByUser?.FullName ?? "Unknown";
                await _notificationService.NotifyTaskStatusChangeAsync(taskId, "Paused", pausedByName, cancellationToken);

                _logger.LogInformation("Task {TaskId} paused by user {UserId}. Reason: {Reason}. Notifications sent to task initiator and relevant parties.",
                    taskId, userId, pauseReason);

                var result = await BuildPauseHistoryDto(task, cancellationToken);
                return ServiceResult<TaskPauseHistoryDto>.Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error pausing task {TaskId}", taskId);
                return ServiceResult<TaskPauseHistoryDto>.Failure($"Failed to pause task: {ex.Message}");
            }
        }

        public async Task<ServiceResult<TaskPauseHistoryDto>> ResumeTaskAsync(
            int taskId, int userId, string? resumeComment, CancellationToken cancellationToken = default)
        {
            try
            {
                var task = await _context.Tasks
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

                if (task == null)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Task not found");
                }

                if (!task.IsPaused)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Task is not currently paused");
                }

                // Calculate paused duration
                long pausedMinutes = 0;
                if (task.PausedAt.HasValue)
                {
                    pausedMinutes = (long)(DateTime.UtcNow - task.PausedAt.Value).TotalMinutes;
                }

                // Update task fields
                task.IsPaused = false;
                task.TotalPausedDurationMinutes += pausedMinutes;
                task.LastResumedAt = DateTime.UtcNow;
                task.Status = TaskStatus.InProgress; // Resume back to InProgress
                task.UpdatedAt = DateTime.UtcNow;
                task.StatusChangedAt = DateTime.UtcNow; // BUG FIX: Track when status changed for overdue calculations

                // Create update history entry
                var durationFormatted = FormatDuration(pausedMinutes);
                var historyEntry = new TaskUpdateHistory
                {
                    TaskId = taskId,
                    UpdatedByUserId = userId,
                    UpdateType = "StatusChange",
                    FieldName = "Status",
                    OldValue = "Paused",
                    NewValue = "InProgress",
                    UpdateComment = $"[RESUMED] Paused for {durationFormatted}.{(string.IsNullOrWhiteSpace(resumeComment) ? "" : $" Comment: {resumeComment}")}",
                    UpdatedAt = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };

                _context.TaskUpdateHistories.Add(historyEntry);
                await _context.SaveChangesAsync(cancellationToken);

                // Notify the task initiator (creator) and relevant parties when a task is resumed
                var resumedByUser = await _context.Users.FindAsync(new object[] { userId }, cancellationToken);
                var resumedByName = resumedByUser?.FullName ?? "Unknown";
                await _notificationService.NotifyTaskStatusChangeAsync(taskId, "Resumed (InProgress)", resumedByName, cancellationToken);

                _logger.LogInformation("Task {TaskId} resumed by user {UserId}. Paused duration: {Duration} minutes. Notifications sent.",
                    taskId, userId, pausedMinutes);

                var result = await BuildPauseHistoryDto(task, cancellationToken);
                return ServiceResult<TaskPauseHistoryDto>.Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resuming task {TaskId}", taskId);
                return ServiceResult<TaskPauseHistoryDto>.Failure($"Failed to resume task: {ex.Message}");
            }
        }

        public async Task<ServiceResult<TaskPauseHistoryDto>> GetPauseHistoryAsync(
            int taskId, CancellationToken cancellationToken = default)
        {
            try
            {
                var task = await _context.Tasks
                    .Include(t => t.Creator)
                    .FirstOrDefaultAsync(t => t.TaskId == taskId, cancellationToken);

                if (task == null)
                {
                    return ServiceResult<TaskPauseHistoryDto>.Failure("Task not found");
                }

                var result = await BuildPauseHistoryDto(task, cancellationToken);
                return ServiceResult<TaskPauseHistoryDto>.Success(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting pause history for task {TaskId}", taskId);
                return ServiceResult<TaskPauseHistoryDto>.Failure($"Failed to get pause history: {ex.Message}");
            }
        }

        private async Task<TaskPauseHistoryDto> BuildPauseHistoryDto(
            Domain.Models.Task task, CancellationToken cancellationToken)
        {
            // Get pause/resume events from update history
            var updateHistory = await _context.TaskUpdateHistories
                .Where(h => h.TaskId == task.TaskId &&
                           (h.UpdateComment!.Contains("[PAUSED]") || h.UpdateComment!.Contains("[RESUMED]")))
                .OrderByDescending(h => h.UpdatedAt)
                .ToListAsync(cancellationToken);

            var pausedByUser = task.PausedBy.HasValue
                ? await _context.Users.FindAsync(new object[] { task.PausedBy.Value }, cancellationToken)
                : null;

            var events = new List<PauseResumeEventDto>();
            int eventId = 1;

            foreach (var entry in updateHistory)
            {
                var user = await _context.Users.FindAsync(new object[] { entry.UpdatedByUserId }, cancellationToken);
                var isPause = entry.UpdateComment?.Contains("[PAUSED]") ?? false;

                events.Add(new PauseResumeEventDto
                {
                    EventId = eventId++,
                    EventType = isPause ? "Paused" : "Resumed",
                    EventDate = entry.UpdatedAt,
                    Reason = entry.UpdateComment?.Replace("[PAUSED] ", "").Replace("[RESUMED] ", ""),
                    UserId = entry.UpdatedByUserId,
                    UserName = user?.FullName ?? "Unknown"
                });
            }

            // Calculate current paused duration if still paused
            var totalMinutes = task.TotalPausedDurationMinutes;
            if (task.IsPaused && task.PausedAt.HasValue)
            {
                totalMinutes += (long)(DateTime.UtcNow - task.PausedAt.Value).TotalMinutes;
            }

            return new TaskPauseHistoryDto
            {
                TaskId = task.TaskId,
                TaskDescription = task.Description,
                IsPaused = task.IsPaused,
                PausedAt = task.PausedAt,
                PausedReason = task.PausedReason,
                PausedByUserId = task.PausedBy,
                PausedByUserName = pausedByUser?.FullName,
                LastResumedAt = task.LastResumedAt,
                TotalPausedDurationMinutes = totalMinutes,
                TotalPausedDurationFormatted = FormatDuration(totalMinutes),
                StatusChangedAt = task.StatusChangedAt, // BUG FIX: Include status change timestamp
                Events = events
            };
        }

        private static string FormatDuration(long totalMinutes)
        {
            if (totalMinutes < 1) return "Less than a minute";
            if (totalMinutes < 60) return $"{totalMinutes}m";

            var hours = totalMinutes / 60;
            var minutes = totalMinutes % 60;

            if (hours < 24)
            {
                return minutes > 0 ? $"{hours}h {minutes}m" : $"{hours}h";
            }

            var days = hours / 24;
            hours = hours % 24;

            if (hours > 0 && minutes > 0)
                return $"{days}d {hours}h {minutes}m";
            if (hours > 0)
                return $"{days}d {hours}h";
            return $"{days}d";
        }
    }
}