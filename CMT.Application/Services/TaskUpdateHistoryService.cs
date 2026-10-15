using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CMT.Application.Services
{
    public class TaskUpdateHistoryService : ITaskUpdateHistoryService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<TaskUpdateHistoryService> _logger;

        public TaskUpdateHistoryService(
            ApplicationDbContext context,
            ILogger<TaskUpdateHistoryService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// ENHANCED: Search for update history across BOTH active and completed tasks
        /// with improved original_task_id extraction and comprehensive logging
        /// </summary>
        public async System.Threading.Tasks.Task<IEnumerable<TaskUpdateHistory>> GetTaskUpdateHistoryAsync(int taskId)
        {
            try
            {
                _logger.LogInformation("[TaskUpdateHistoryService] ===== STARTING UPDATE HISTORY SEARCH =====");
                _logger.LogInformation("[TaskUpdateHistoryService] Requested taskId: {TaskId}", taskId);
                
                // Collect all possible task IDs to search for
                var taskIdsToSearch = new HashSet<int> { taskId };
                
                // STEP 1: Check if this taskId exists in active tasks table
                var activeTask = await _context.Tasks
                    .Where(t => t.TaskId == taskId && t.RecordStatus == RecordStatus.Active)
                    .FirstOrDefaultAsync();
                
                if (activeTask != null)
                {
                    _logger.LogInformation("[TaskUpdateHistoryService] Task {TaskId} found in ACTIVE tasks table", taskId);
                    
                    // Search history directly with this task_id
                    var activeHistory = await _context.TaskUpdateHistories
                        .Where(h => h.TaskId == taskId && h.RecordStatus == RecordStatus.Active)
                        .Include(h => h.UpdatedByUser)
                        .OrderByDescending(h => h.UpdatedAt)
                        .ToListAsync();
                    
                    // TIMEZONE FIX: Ensure all UpdatedAt values have DateTimeKind.Utc set
                    foreach (var entry in activeHistory)
                    {
                        EnsureUtcKind(entry);
                    }
                    
                    _logger.LogInformation("[TaskUpdateHistoryService] Found {Count} history entries for ACTIVE task {TaskId}", 
                        activeHistory.Count, taskId);
                    
                    return activeHistory;
                }
                
                _logger.LogInformation("[TaskUpdateHistoryService] Task {TaskId} NOT found in active tasks, checking completed tasks...", taskId);
                
                // STEP 2: Check if this taskId is a CompletedTaskId in completed_tasks table
                var completedTaskByCompletedId = await _context.CompletedTasks
                    .Where(ct => ct.CompletedTaskId == taskId && ct.RecordStatus == RecordStatus.Active)
                    .FirstOrDefaultAsync();
                
                if (completedTaskByCompletedId != null)
                {
                    var originalTaskId = completedTaskByCompletedId.OriginalTaskId;
                    taskIdsToSearch.Add(originalTaskId);
                    
                    _logger.LogInformation("[TaskUpdateHistoryService] Task {TaskId} is a CompletedTaskId, OriginalTaskId = {OriginalTaskId}", 
                        taskId, originalTaskId);
                }
                
                // STEP 3: Check if this taskId is an OriginalTaskId (task that has been completed)
                var completedTaskByOriginalId = await _context.CompletedTasks
                    .Where(ct => ct.OriginalTaskId == taskId && ct.RecordStatus == RecordStatus.Active)
                    .FirstOrDefaultAsync();
                
                if (completedTaskByOriginalId != null)
                {
                    var completedTaskId = completedTaskByOriginalId.CompletedTaskId;
                    taskIdsToSearch.Add(completedTaskId);
                    
                    _logger.LogInformation("[TaskUpdateHistoryService] Task {TaskId} is an OriginalTaskId for CompletedTask {CompletedTaskId}", 
                        taskId, completedTaskId);
                }
                
                // STEP 4: Search history for ALL collected task IDs
                _logger.LogInformation("[TaskUpdateHistoryService] Searching history for task IDs: {TaskIds}", 
                    string.Join(", ", taskIdsToSearch));
                
                var allHistory = await _context.TaskUpdateHistories
                    .Where(h => taskIdsToSearch.Contains(h.TaskId) && h.RecordStatus == RecordStatus.Active)
                    .Include(h => h.UpdatedByUser)
                    .OrderByDescending(h => h.UpdatedAt)
                    .ToListAsync();
                
                // TIMEZONE FIX: Ensure all UpdatedAt values have DateTimeKind.Utc set
                foreach (var entry in allHistory)
                {
                    EnsureUtcKind(entry);
                }
                
                _logger.LogInformation("[TaskUpdateHistoryService] Found {Count} total history entries across all related task IDs", 
                    allHistory.Count);
                
                // CRITICAL DEBUG: If no history found, check if records exist but are inactive
                if (allHistory.Count == 0)
                {
                    var inactiveCount = await _context.TaskUpdateHistories
                        .Where(h => taskIdsToSearch.Contains(h.TaskId))
                        .CountAsync();
                    
                    _logger.LogWarning("[TaskUpdateHistoryService] No active history found, but found {InactiveCount} total records (including inactive)", 
                        inactiveCount);
                    
                    // Log all distinct TaskIds in history table for debugging
                    var allTaskIdsInHistory = await _context.TaskUpdateHistories
                        .Select(h => h.TaskId)
                        .Distinct()
                        .OrderBy(id => id)
                        .ToListAsync();
                    
                    _logger.LogWarning("[TaskUpdateHistoryService] All TaskIds in history table: {TaskIds}", 
                        string.Join(", ", allTaskIdsInHistory));
                    
                    // Log sample of recent history records
                    var sampleHistory = await _context.TaskUpdateHistories
                        .Where(h => h.RecordStatus == RecordStatus.Active)
                        .OrderByDescending(h => h.UpdatedAt)
                        .Take(10)
                        .Select(h => new { h.UpdateHistoryId, h.TaskId, h.UpdatedAt, h.UpdateType })
                        .ToListAsync();
                    
                    _logger.LogWarning("[TaskUpdateHistoryService] Sample of recent history records: {Sample}", 
                        string.Join(", ", sampleHistory.Select(s => $"[HistoryId={s.UpdateHistoryId}, TaskId={s.TaskId}, Type={s.UpdateType}]")));
                }
                
                return allHistory;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TaskUpdateHistoryService] Failed to get update history for task {TaskId}", taskId);
                return Enumerable.Empty<TaskUpdateHistory>();
            }
        }

        public async System.Threading.Tasks.Task<(IEnumerable<TaskUpdateHistory> history, int totalCount)> GetTaskUpdateHistoryPagedAsync(
            int taskId,
            int pageNumber = 1,
            int pageSize = 50)
        {
            try
            {
                _logger.LogInformation("[TaskUpdateHistoryService] Getting paged update history for taskId: {TaskId}, page: {PageNumber}, pageSize: {PageSize}", 
                    taskId, pageNumber, pageSize);
                
                // Collect all possible task IDs to search for
                var taskIdsToSearch = new HashSet<int> { taskId };
                
                // Check if this is an active task
                var isActiveTask = await _context.Tasks.AnyAsync(t => t.TaskId == taskId && t.RecordStatus == RecordStatus.Active);
                
                if (!isActiveTask)
                {
                    // Check if this is a completed task ID
                    var completedTaskByCompletedId = await _context.CompletedTasks
                        .FirstOrDefaultAsync(ct => ct.CompletedTaskId == taskId && ct.RecordStatus == RecordStatus.Active);
                    
                    if (completedTaskByCompletedId != null)
                    {
                        taskIdsToSearch.Add(completedTaskByCompletedId.OriginalTaskId);
                        _logger.LogInformation("[TaskUpdateHistoryService] Using original_task_id {OriginalTaskId} for completed task {CompletedTaskId}", 
                            completedTaskByCompletedId.OriginalTaskId, taskId);
                    }
                    
                    // Check if this is an original task ID
                    var completedTaskByOriginalId = await _context.CompletedTasks
                        .FirstOrDefaultAsync(ct => ct.OriginalTaskId == taskId && ct.RecordStatus == RecordStatus.Active);
                    
                    if (completedTaskByOriginalId != null)
                    {
                        taskIdsToSearch.Add(completedTaskByOriginalId.CompletedTaskId);
                        _logger.LogInformation("[TaskUpdateHistoryService] Task {TaskId} is an OriginalTaskId for CompletedTask {CompletedTaskId}", 
                            taskId, completedTaskByOriginalId.CompletedTaskId);
                    }
                }

                var query = _context.TaskUpdateHistories
                    .Where(h => taskIdsToSearch.Contains(h.TaskId) && h.RecordStatus == RecordStatus.Active)
                    .Include(h => h.UpdatedByUser)
                    .OrderByDescending(h => h.UpdatedAt);

                var totalCount = await query.CountAsync();
                var history = await query
                    .Skip((pageNumber - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                // TIMEZONE FIX: Ensure all UpdatedAt values have DateTimeKind.Utc set
                foreach (var entry in history)
                {
                    EnsureUtcKind(entry);
                }

                _logger.LogInformation("[TaskUpdateHistoryService] Found {Count} of {TotalCount} history entries for task IDs: {TaskIds}", 
                    history.Count, totalCount, string.Join(", ", taskIdsToSearch));

                return (history, totalCount);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TaskUpdateHistoryService] Failed to get paged update history for task {TaskId}", taskId);
                return (Enumerable.Empty<TaskUpdateHistory>(), 0);
            }
        }

        public async System.Threading.Tasks.Task<TaskUpdateHistory> LogTaskUpdateAsync(TaskUpdateHistory updateHistory)
        {
            try
            {
                // TIMEZONE FIX: Always store timestamps as UTC with explicit DateTimeKind
                var nowUtc = DateTime.UtcNow;

                // Set base entity properties — all consistently UTC
                updateHistory.CreatedAt = nowUtc;
                updateHistory.UpdatedAt = nowUtc;
                updateHistory.RegisteredBy = updateHistory.UpdatedByUserName;
                updateHistory.RegisteredDate = nowUtc;
                updateHistory.LastUpdateDate = nowUtc;
                updateHistory.UpdatedBy = updateHistory.UpdatedByUserName;
                updateHistory.StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                updateHistory.EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc);
                updateHistory.TimeZoneInfo = "UTC";
                updateHistory.RecordStatus = RecordStatus.Active;
                updateHistory.IsReadOnly = false;

                _context.TaskUpdateHistories.Add(updateHistory);
                await _context.SaveChangesAsync();

                _logger.LogInformation(
                    "[TaskUpdateHistoryService] Logged task update: TaskId={TaskId}, UpdatedBy={UpdatedBy}, UpdateType={UpdateType}, UpdatedAt={UpdatedAt:O}",
                    updateHistory.TaskId,
                    updateHistory.UpdatedByUserName,
                    updateHistory.UpdateType,
                    updateHistory.UpdatedAt);

                return updateHistory;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TaskUpdateHistoryService] Failed to log task update for task {TaskId}", updateHistory.TaskId);
                throw;
            }
        }

        public async System.Threading.Tasks.Task LogTaskUpdateWithChangesAsync(
            int taskId,
            int updatedByUserId,
            string updatedByUserName,
            string updatedByUserRole,
            Dictionary<string, (string? oldValue, string? newValue)> changes,
            string? updateComment = null,
            string? ipAddress = null)
        {
            try
            {
                // TIMEZONE FIX: Capture a single UTC timestamp for all changes in this batch
                // so they all share the exact same timestamp for consistency
                var batchTimestamp = DateTime.UtcNow;

                foreach (var change in changes)
                {
                    var updateHistory = new TaskUpdateHistory
                    {
                        TaskId = taskId,
                        UpdatedByUserId = updatedByUserId,
                        UpdatedByUserName = updatedByUserName,
                        UpdatedByUserRole = updatedByUserRole,
                        UpdateType = DetermineUpdateType(change.Key),
                        FieldName = change.Key,
                        OldValue = change.Value.oldValue,
                        NewValue = change.Value.newValue,
                        UpdateComment = updateComment,
                        IpAddress = ipAddress,
                        UpdatedAt = batchTimestamp
                    };

                    await LogTaskUpdateAsync(updateHistory);
                }

                _logger.LogInformation(
                    "[TaskUpdateHistoryService] Logged {ChangeCount} field changes for task {TaskId} by {UpdatedBy} at {Timestamp:O}",
                    changes.Count,
                    taskId,
                    updatedByUserName,
                    batchTimestamp);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[TaskUpdateHistoryService] Failed to log task updates with changes for task {TaskId}", taskId);
                throw;
            }
        }

        private string DetermineUpdateType(string fieldName)
        {
            return fieldName.ToLower() switch
            {
                "status" => "STATUS_CHANGE",
                "assignedengineer" or "assigned_engineer" => "ASSIGNMENT_CHANGE",
                "priorityid" or "priority_id" or "priority" => "PRIORITY_CHANGE",
                "targetcompletiondate" or "target_completion_date" => "DEADLINE_CHANGE",
                "description" => "DESCRIPTION_CHANGE",
                "comments" => "COMMENT_ADDED",
                "revisionnotes" or "revision_notes" => "REVISION_NOTES_UPDATED",
                "showrevisionalert" or "show_revision_alert" => "ALERT_TOGGLED",
                _ => "GENERAL_UPDATE"
            };
        }

        /// <summary>
        /// TIMEZONE FIX: Ensures all DateTime fields on a TaskUpdateHistory entry
        /// have DateTimeKind.Utc set. This is necessary because some database providers
        /// (e.g., PostgreSQL with Npgsql, or SQL Server) may return DateTime values
        /// with DateTimeKind.Unspecified, which causes the frontend to interpret them
        /// as local time instead of UTC, leading to inconsistent display.
        /// </summary>
        private static void EnsureUtcKind(TaskUpdateHistory entry)
        {
            if (entry.UpdatedAt.Kind == DateTimeKind.Unspecified)
            {
                entry.UpdatedAt = DateTime.SpecifyKind(entry.UpdatedAt, DateTimeKind.Utc);
            }
            if (entry.CreatedAt.Kind == DateTimeKind.Unspecified)
            {
                entry.CreatedAt = DateTime.SpecifyKind(entry.CreatedAt, DateTimeKind.Utc);
            }
            if (entry.RegisteredDate.Kind == DateTimeKind.Unspecified)
            {
                entry.RegisteredDate = DateTime.SpecifyKind(entry.RegisteredDate, DateTimeKind.Utc);
            }
            if (entry.LastUpdateDate.Kind == DateTimeKind.Unspecified)
            {
                entry.LastUpdateDate = DateTime.SpecifyKind(entry.LastUpdateDate, DateTimeKind.Utc);
            }
            if (entry.StartDate.Kind == DateTimeKind.Unspecified)
            {
                entry.StartDate = DateTime.SpecifyKind(entry.StartDate, DateTimeKind.Utc);
            }
            if (entry.EndDate.Kind == DateTimeKind.Unspecified)
            {
                entry.EndDate = DateTime.SpecifyKind(entry.EndDate, DateTimeKind.Utc);
            }
        }
    }
}