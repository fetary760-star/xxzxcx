using CMT.Application.Services;
using CMT.Domain.Data;
using CMT.Domain.Models;
using CMT.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using DomainAmendmentStatus = CMT.Domain.Enums.AmendmentStatus;
using DomainTask = CMT.Domain.Models.Task;
using Task = System.Threading.Tasks.Task;

namespace CMT.Application.Services
{
    public class CompletedTaskService : ICompletedTaskService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<CompletedTaskService> _logger;

        public CompletedTaskService(ApplicationDbContext context, ILogger<CompletedTaskService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<IEnumerable<CompletedTask>> GetAllCompletedTasksAsync()
        {
            var tasks = await _context.CompletedTasks
                .Where(t => t.RecordStatus == RecordStatus.Active && t.Status == DomainTaskStatus.Completed)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .OrderByDescending(t => t.CompletedAt)
                .ToListAsync();

            // CRITICAL FIX: Ensure UTC DateTimeKind on all materialized entities
            foreach (var task in tasks)
                task.EnsureUtcDateTimeKinds();

            return tasks;
        }

        public async Task<CompletedTask?> GetCompletedTaskByIdAsync(int completedTaskId)
        {
            var task = await _context.CompletedTasks
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .Include(t => t.TaskComments)
                    .ThenInclude(c => c.Author)
                .FirstOrDefaultAsync(t => t.CompletedTaskId == completedTaskId);

            // CRITICAL FIX: Ensure UTC DateTimeKind
            task?.EnsureUtcDateTimeKinds();

            return task;
        }

        public async Task<CompletedTask?> GetCompletedTaskByOriginalIdAsync(int originalTaskId)
        {
            var task = await _context.CompletedTasks
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .Include(t => t.TaskComments)
                    .ThenInclude(c => c.Author)
                .FirstOrDefaultAsync(t => t.OriginalTaskId == originalTaskId);

            // CRITICAL FIX: Ensure UTC DateTimeKind
            task?.EnsureUtcDateTimeKinds();

            return task;
        }

        /// <summary>
        /// CRITICAL FIX: Enhanced method with STRICT shop filtering support for shop_tl users
        /// and AssignedEngineer filtering for Directors to see tasks assigned to their Team Leaders.
        /// AMENDED: Date filter now uses CompletedAt (not TaskCreatedAt) for the export date range
        /// so that the exported data matches exactly what was visible in the selected date window.
        /// </summary>
        public async Task<(IEnumerable<CompletedTask> tasks, int totalCount)> GetCompletedTasksWithFiltersAsync(
            int? categoryId = null,
            string? searchQuery = null,
            int? priorityId = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            int pageNumber = 1,
            int pageSize = 50,
            string? amendmentStatusFilter = null,
            bool? reopenedFilter = null,
            IEnumerable<int>? createdByUserIds = null,
            int? shopIdFilter = null,
            IEnumerable<string>? assignedEngineerNames = null)
        {
            _logger.LogInformation("GetCompletedTasksWithFiltersAsync called with fromDate={FromDate}, toDate={ToDate}, shopIdFilter={ShopIdFilter}, assignedEngineerNames={AssignedEngineerNames}", 
                fromDate, toDate, shopIdFilter,
                assignedEngineerNames != null ? string.Join(",", assignedEngineerNames) : "null");

            var query = _context.CompletedTasks
                .Where(t => t.RecordStatus == RecordStatus.Active && t.Status == DomainTaskStatus.Completed)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .AsQueryable();

            // CRITICAL FIX: Apply STRICT shop filter FIRST
            if (shopIdFilter.HasValue)
            {
                query = query.Where(t => 
                    (t.ShopId.HasValue && t.ShopId.Value == shopIdFilter.Value) || 
                    (t.Creator != null && t.Creator.ShopId.HasValue && t.Creator.ShopId.Value == shopIdFilter.Value));
            }

            // Apply user filter OR assigned engineer filter for directors
            if (createdByUserIds != null && createdByUserIds.Any())
            {
                if (assignedEngineerNames != null && assignedEngineerNames.Any())
                {
                    query = query.Where(t => 
                        createdByUserIds.Contains(t.CreatedBy) || 
                        (t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer)));
                }
                else
                {
                    query = query.Where(t => createdByUserIds.Contains(t.CreatedBy));
                }
            }
            else if (assignedEngineerNames != null && assignedEngineerNames.Any())
            {
                query = query.Where(t => t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer));
            }

            // Apply other filters
            if (categoryId.HasValue)
                query = query.Where(t => t.CategoryId == categoryId.Value);

            if (!string.IsNullOrEmpty(searchQuery))
                query = query.Where(t => t.Description.Contains(searchQuery) || 
                                       (t.SerialNumber != null && t.SerialNumber.Contains(searchQuery)) ||
                                       (t.PartNumber != null && t.PartNumber.Contains(searchQuery)));

            if (priorityId.HasValue)
                query = query.Where(t => t.PriorityId == priorityId.Value);

            // ─── CRITICAL FIX: Date range filter ───────────────────────────────────
            // Use CompletedAt for the date range so it matches what the user sees.
            // Normalize: fromDate = start of day, toDate = end of day (inclusive).
            if (fromDate.HasValue)
            {
                var rangeStart = fromDate.Value.Date; // 00:00:00
                query = query.Where(t => t.CompletedAt >= rangeStart);
            }
            if (toDate.HasValue)
            {
                var rangeEnd = toDate.Value.Date.AddDays(1).AddTicks(-1); // 23:59:59.9999999
                query = query.Where(t => t.CompletedAt <= rangeEnd);
            }

            // Amendment filtering logic
            if (!string.IsNullOrEmpty(amendmentStatusFilter))
            {
                switch (amendmentStatusFilter.ToLower())
                {
                    case "pending_tl":
                        query = query.Where(t => t.AmendmentRequest == true && 
                                               t.AmendmentStatus == DomainAmendmentStatus.PendingTLReview);
                        break;
                    case "forwarded":
                        query = query.Where(t => t.AmendmentRequest == true && 
                                               t.AmendmentStatus == DomainAmendmentStatus.ForwardedToDirector);
                        break;
                    case "approved":
                        query = query.Where(t => t.AmendmentRequest == true && 
                                               t.AmendmentStatus == DomainAmendmentStatus.Approved);
                        break;
                    case "rejected":
                        query = query.Where(t => t.AmendmentRequest == true && 
                                               t.AmendmentStatus == DomainAmendmentStatus.Rejected);
                        break;
                    case "pending":
                        query = query.Where(t => t.AmendmentRequest == true && 
                                               (t.AmendmentStatus == DomainAmendmentStatus.PendingTLReview || 
                                                t.AmendmentStatus == DomainAmendmentStatus.ForwardedToDirector));
                        break;
                }
            }

            if (reopenedFilter.HasValue && reopenedFilter.Value)
            {
                query = query.Where(t => t.IsReopened == true || 
                                       (t.Comments != null && t.Comments.Contains("[REOPENED by")));
            }

            var totalCount = await query.CountAsync();

            var tasks = await query
                .OrderByDescending(t => t.CompletedAt)
                .Skip((pageNumber - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            // CRITICAL FIX: Ensure UTC DateTimeKind on all materialized entities
            foreach (var task in tasks)
                task.EnsureUtcDateTimeKinds();

            _logger.LogInformation("Retrieved {TaskCount} completed tasks for page {PageNumber} (total: {TotalCount})", 
                tasks.Count, pageNumber, totalCount);

            return (tasks, totalCount);
        }

        /// <summary>
        /// Normalizes any DateTime into a true UTC instant.
        /// EF Core materializes SQL Server datetime2 columns with Kind = Unspecified even
        /// though the stored value is UTC, and a value set in memory may carry Kind = Local.
        /// Blindly calling SpecifyKind(..., Utc) on a Local value shifted the timestamp,
        /// which is one of the reasons the Target Completion appeared to move backward.
        /// </summary>
        private static DateTime? AsUtc(DateTime? value)
        {
            if (!value.HasValue || value.Value == default)
                return null;

            return value.Value.Kind switch
            {
                DateTimeKind.Utc => value.Value,
                DateTimeKind.Local => value.Value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
            };
        }

        // FIXED: Enhanced MoveTaskToCompletedAsync - BACKFILL ShopId + ENSURE UTC DateTime
        public async Task<CompletedTask> MoveTaskToCompletedAsync(DomainTask task)
        {
            _logger.LogInformation("Starting task migration to completed_tasks for TaskId: {TaskId}", task.TaskId);

            var strategy = _context.Database.CreateExecutionStrategy();
            
            return await strategy.ExecuteAsync(async () =>
            {
                var fullTask = await _context.Tasks
                    .Include(t => t.TaskComments)
                        .ThenInclude(c => c.Author)
                    .Include(t => t.Attachments)
                    .Include(t => t.Creator)
                        .ThenInclude(c => c.Shop)
                    .FirstOrDefaultAsync(t => t.TaskId == task.TaskId);

                if (fullTask == null)
                {
                    throw new InvalidOperationException($"Task with ID {task.TaskId} not found");
                }

                int? effectiveShopId = task.ShopId;
                if (!effectiveShopId.HasValue && fullTask.Creator?.ShopId.HasValue == true)
                {
                    effectiveShopId = fullTask.Creator.ShopId.Value;
                }

                // ─────────────────────────────────────────────────────────────────────
                // BUG FIX: always copy the LATEST PERSISTED TargetCompletionDate.
                //
                // `task` is the entity handed in by the caller and can be stale (it may
                // have been loaded before the Team Leader's most recent target update, or
                // detached from the tracking context). `fullTask` is the row that was just
                // re-read from the database inside this method, so it always holds the most
                // recent value. Copying from `task` is why a task completed after a target
                // update was archived with the OLDER auto-calculated timestamp, making the
                // Target Completion look like it had moved backward in the completed view.
                //
                // `fullTask` now wins; `task` is only a fallback when the column is empty.
                // ─────────────────────────────────────────────────────────────────────
                fullTask.EnsureUtcDateTimeKinds();

                DateTime? targetCompletionUtc =
                    AsUtc(fullTask.TargetCompletionDate) ?? AsUtc(task.TargetCompletionDate);

                DateTime? actualCompletionUtc =
                    AsUtc(fullTask.ActualCompletionDate)
                    ?? AsUtc(task.ActualCompletionDate)
                    ?? DateTime.UtcNow;

                var completedTask = new CompletedTask
                {
                    OriginalTaskId = task.TaskId,
                    SerialNumber = task.SerialNumber,
                    PartNumber = task.PartNumber,
                    PoNumber = task.PoNumber,
                    Description = task.Description,
                    CategoryId = task.CategoryId,
                    SubTypeId = task.SubTypeId,
                    RequestTypeId = task.RequestTypeId,
                    Status = DomainTaskStatus.Completed,
                    Comments = task.Comments,
                    AssignedEngineer = task.AssignedEngineer,
                    PriorityId = task.PriorityId,
                    EstimatedCompletionDate = DateTime.SpecifyKind(task.EstimatedCompletionDate, DateTimeKind.Utc),
                    // CRITICAL FIX: Store TargetCompletionDate as UTC
                    TargetCompletionDate = targetCompletionUtc,
                    ActualCompletionDate = actualCompletionUtc,
                    AttachmentPath = task.AttachmentPath,
                    
                    AmendmentRequest = task.AmendmentRequest,
                    AmendmentStatus = task.AmendmentStatus,
                    AmendmentReviewedByTlId = task.AmendmentReviewedByTlId,
                    
                    IsReopened = task.IsReopened,
                    ReopenCount = task.ReopenCount,
                    ReopenedBy = task.ReopenedBy,
                    ReopenedAt = task.ReopenedAt,
                    ReopenReason = task.ReopenReason,
                    
                    IsDuplicate = task.IsDuplicate,
                    DuplicateJustification = task.DuplicateJustification,
                    RevisionNotes = task.RevisionNotes,
                    ShowRevisionAlert = task.ShowRevisionAlert,
                    ShopId = effectiveShopId,
                    CreatedBy = task.CreatedBy,
                    IsMandatory = task.IsMandatory,
                    CancelledBy = task.CancelledBy,
                    CancellationReason = task.CancellationReason,
                    CancelledAt = task.CancelledAt,
                    TaskAssignedAt = task.AssignedAt.HasValue 
                        ? DateTime.SpecifyKind(task.AssignedAt.Value, DateTimeKind.Utc) 
                        : null,
                    EngineerCompletedAt = task.ActualCompletionDate.HasValue
                        ? DateTime.SpecifyKind(task.ActualCompletionDate.Value, DateTimeKind.Utc)
                        : null,
                    TaskCreatedAt = DateTime.SpecifyKind(task.CreatedAt, DateTimeKind.Utc),
                    TaskUpdatedAt = DateTime.SpecifyKind(task.UpdatedAt, DateTimeKind.Utc),
                    CompletedAt = DateTime.UtcNow,
                    MovedToCompletedAt = DateTime.UtcNow,
                    RegisteredDate = DateTime.UtcNow,
                    LastUpdateDate = DateTime.UtcNow
                };

                _context.CompletedTasks.Add(completedTask);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Created completed task with ID: {CompletedTaskId}, TargetCompletionDate(UTC): {TargetDate}", 
                    completedTask.CompletedTaskId, completedTask.TargetCompletionDate);

                // Copy comments
                if (fullTask.TaskComments != null && fullTask.TaskComments.Any())
                {
                    foreach (var comment in fullTask.TaskComments)
                    {
                        var completedTaskComment = new CompletedTaskComment
                        {
                            CompletedTaskId = completedTask.CompletedTaskId,
                            AuthorId = comment.AuthorId ?? 1,
                            CommentText = comment.Content,
                            CreatedAt = DateTime.SpecifyKind(comment.CreatedAt, DateTimeKind.Utc),
                            UpdatedAt = DateTime.SpecifyKind(comment.UpdatedAt, DateTimeKind.Utc),
                            RegisteredDate = DateTime.UtcNow,
                            LastUpdateDate = DateTime.UtcNow,
                            RecordStatus = RecordStatus.Active
                        };
                        _context.CompletedTaskComments.Add(completedTaskComment);
                    }
                    await _context.SaveChangesAsync();
                }

                // Copy attachments
                if (fullTask.Attachments != null && fullTask.Attachments.Any())
                {
                    foreach (var attachment in fullTask.Attachments)
                    {
                        var completedTaskAttachment = new CompletedTaskAttachment
                        {
                            CompletedTaskId = completedTask.CompletedTaskId,
                            FileName = attachment.FileName,
                            FilePath = attachment.FilePath,
                            FileType = attachment.FileType,
                            FileSize = attachment.FileSize,
                            UploadedAt = attachment.UploadedAt,
                            RegisteredDate = DateTime.UtcNow,
                            LastUpdateDate = DateTime.UtcNow,
                            RecordStatus = RecordStatus.Active
                        };
                        _context.CompletedTaskAttachments.Add(completedTaskAttachment);
                    }
                    await _context.SaveChangesAsync();
                }

                // Update original task
                try
                {
                    fullTask.Status = DomainTaskStatus.Completed;
                    fullTask.ActualCompletionDate = completedTask.ActualCompletionDate;
                    fullTask.UpdatedAt = DateTime.UtcNow;
                    _context.Tasks.Update(fullTask);
                    await _context.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to update original Task {TaskId} to Completed.", fullTask.TaskId);
                }

                return await GetCompletedTaskByIdAsync(completedTask.CompletedTaskId) ?? completedTask;
            });
        }

        public async Task<CompletedTask?> ReopenCompletedTaskAsync(int completedTaskId)
        {
            var strategy = _context.Database.CreateExecutionStrategy();
            
            return await strategy.ExecuteAsync(async () =>
            {
                var completedTask = await _context.CompletedTasks
                    .Include(ct => ct.TaskComments)
                        .ThenInclude(c => c.Author)
                    .Include(ct => ct.Attachments)
                    .FirstOrDefaultAsync(ct => ct.CompletedTaskId == completedTaskId);

                if (completedTask == null) return null;

                var reopenedTask = new DomainTask
                {
                    SerialNumber = completedTask.SerialNumber,
                    PartNumber = completedTask.PartNumber,
                    PoNumber = completedTask.PoNumber,
                    Description = completedTask.Description,
                    CategoryId = completedTask.CategoryId,
                    SubTypeId = completedTask.SubTypeId,
                    RequestTypeId = completedTask.RequestTypeId,
                    Status = DomainTaskStatus.Pending,
                    Comments = $"{completedTask.Comments}\\n\\n[REOPENED]: Task reopened from completed status",
                    AssignedEngineer = completedTask.AssignedEngineer,
                    PriorityId = completedTask.PriorityId,
                    EstimatedCompletionDate = completedTask.EstimatedCompletionDate,
                    TargetCompletionDate = completedTask.TargetCompletionDate,
                    ActualCompletionDate = null,
                    AttachmentPath = completedTask.AttachmentPath,
                    AmendmentRequest = completedTask.AmendmentRequest,
                    AmendmentStatus = completedTask.AmendmentStatus,
                    AmendmentReviewedByTlId = completedTask.AmendmentReviewedByTlId,
                    IsReopened = true,
                    ReopenCount = completedTask.ReopenCount + 1,
                    ReopenedBy = null,
                    ReopenedAt = DateTime.UtcNow,
                    ReopenReason = "Reopened from completed tasks",
                    IsDuplicate = completedTask.IsDuplicate,
                    DuplicateJustification = completedTask.DuplicateJustification,
                    RevisionNotes = completedTask.RevisionNotes,
                    ShowRevisionAlert = true,
                    ShopId = completedTask.ShopId,
                    CreatedBy = completedTask.CreatedBy,
                    IsMandatory = completedTask.IsMandatory,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Tasks.Add(reopenedTask);
                await _context.SaveChangesAsync();

                // Copy comments back
                if (completedTask.TaskComments != null && completedTask.TaskComments.Any())
                {
                    foreach (var comment in completedTask.TaskComments)
                    {
                        var taskComment = new TaskComment
                        {
                            TaskId = reopenedTask.TaskId,
                            AuthorId = comment.AuthorId,
                            Content = comment.CommentText,
                            CreatedAt = comment.CreatedAt,
                            UpdatedAt = comment.UpdatedAt,
                            CommentType = CommentType.UserComment
                        };
                        _context.TaskComments.Add(taskComment);
                    }
                    await _context.SaveChangesAsync();
                }

                // Copy attachments back
                if (completedTask.Attachments != null && completedTask.Attachments.Any())
                {
                    foreach (var attachment in completedTask.Attachments)
                    {
                        var taskAttachment = new TaskAttachment
                        {
                            TaskId = reopenedTask.TaskId,
                            FileName = attachment.FileName,
                            FilePath = attachment.FilePath,
                            FileType = attachment.FileType,
                            FileSize = attachment.FileSize,
                            UploadedBy = completedTask.CreatedBy,
                            UploadedAt = attachment.UploadedAt
                        };
                        _context.TaskAttachments.Add(taskAttachment);
                    }
                    await _context.SaveChangesAsync();
                }

                // Soft-delete the completed task
                completedTask.RecordStatus = RecordStatus.Inactive;
                completedTask.LastUpdateDate = DateTime.UtcNow;
                _context.CompletedTasks.Update(completedTask);
                await _context.SaveChangesAsync();

                return completedTask;
            });
        }

        public async Task<bool> DeleteCompletedTaskAsync(int completedTaskId)
        {
            var completedTask = await _context.CompletedTasks.FindAsync(completedTaskId);
            if (completedTask == null) return false;

            _context.CompletedTasks.Remove(completedTask);
            await _context.SaveChangesAsync();
            return true;
        }

        public async Task<IEnumerable<CompletedTaskComment>> GetCompletedTaskCommentsAsync(int completedTaskId)
        {
            return await _context.CompletedTaskComments
                .Where(c => c.CompletedTaskId == completedTaskId)
                .Include(c => c.Author)
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();
        }

        public async Task<IEnumerable<CompletedTaskAttachment>> GetCompletedTaskAttachmentsAsync(int completedTaskId)
        {
            return await _context.CompletedTaskAttachments
                .Where(a => a.CompletedTaskId == completedTaskId)
                .OrderByDescending(a => a.UploadedAt)
                .ToListAsync();
        }
    }
}