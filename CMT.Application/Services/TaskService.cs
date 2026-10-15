using CMT.Application.Services;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using TaskEntity = CMT.Domain.Models.Task;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using DomainAmendmentStatus = CMT.Domain.Enums.AmendmentStatus;
using Microsoft.Extensions.Logging;

namespace CMT.Application.Services
{
    public class TaskService : ITaskService
    {
        private readonly ApplicationDbContext _context;
        private readonly INotificationService _notificationService;
        private readonly ITaskUpdateHistoryService _updateHistoryService;
        private readonly ILogger<TaskService> _logger;

        public TaskService(
            ApplicationDbContext context, 
            INotificationService notificationService,
            ITaskUpdateHistoryService updateHistoryService,
            ILogger<TaskService> logger)
        {
            _context = context;
            _notificationService = notificationService;
            _updateHistoryService = updateHistoryService;
            _logger = logger;
        }

        public async System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetAllTasksAsync()
        {
            return await _context.Tasks
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
                .ToListAsync();
        }

        public async System.Threading.Tasks.Task<TaskEntity?> GetTaskByIdAsync(int taskId)
        {
            return await _context.Tasks
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                    .ThenInclude(a => a.UploadedByUser)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .Include(t => t.TaskComments)
                    .ThenInclude(c => c.Author)
                .FirstOrDefaultAsync(t => t.TaskId == taskId);
        }

        // FIXED: Updated method signature to match interface with assignedEngineerNames parameter
        public async System.Threading.Tasks.Task<(IEnumerable<TaskEntity> tasks, int totalCount)> GetTasksWithFiltersAsync(
            int? categoryId = null,
            string? statusFilter = null,
            string? searchQuery = null,
            int? priorityId = null,
            DateTime? fromDate = null,
            DateTime? toDate = null,
            int pageNumber = 1,
            int pageSize = 50,
            string? amendmentStatusFilter = null,
            bool? reopenedFilter = null,
            IEnumerable<int>? createdByUserIds = null,
            IEnumerable<string>? assignedEngineerNames = null)
        {
            _logger.LogInformation("GetTasksWithFiltersAsync called with amendmentStatusFilter={AmendmentStatusFilter}, reopenedFilter={ReopenedFilter}, createdByUserIds={CreatedByUserIds}, assignedEngineerNames={AssignedEngineerNames}", 
                amendmentStatusFilter, reopenedFilter, 
                createdByUserIds != null ? string.Join(",", createdByUserIds) : "null",
                assignedEngineerNames != null ? string.Join(",", assignedEngineerNames) : "null");

            // Base query for Active Tasks with enhanced includes for shop_tl filtering
            var activeQuery = _context.Tasks
                .Where(t => t.RecordStatus == RecordStatus.Active)
                .Include(t => t.Creator)
                    .ThenInclude(c => c.Shop)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Include(t => t.Attachments)
                .Include(t => t.AmendmentReviewer)
                .Include(t => t.ReopenedByUser)
                .AsQueryable();

            // CRITICAL FIX: Apply user filter OR assigned engineer filter for directors
            if (createdByUserIds != null && createdByUserIds.Any())
            {
                if (assignedEngineerNames != null && assignedEngineerNames.Any())
                {
                    // For directors: show tasks where EITHER CreatedBy is in scope OR AssignedEngineer matches Team Leader names
                    _logger.LogInformation("Applying combined filter: CreatedBy in [{UserIds}] OR AssignedEngineer in [{EngineerNames}]", 
                        string.Join(", ", createdByUserIds), string.Join(", ", assignedEngineerNames));
                    
                    activeQuery = activeQuery.Where(t => 
                        createdByUserIds.Contains(t.CreatedBy) || 
                        (t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer)));
                }
                else
                {
                    // For shop_tl/manager: only filter by CreatedBy
                    _logger.LogInformation("Applying user filter: CreatedBy in [{UserIds}]", string.Join(", ", createdByUserIds));
                    activeQuery = activeQuery.Where(t => createdByUserIds.Contains(t.CreatedBy));
                }
                
                // Log the count after user filtering for debugging
                var userFilteredCount = await activeQuery.CountAsync();
                _logger.LogInformation("After filtering: {Count} active tasks found", userFilteredCount);
            }
            else if (assignedEngineerNames != null && assignedEngineerNames.Any())
            {
                // Only assigned engineer filter (for directors with no department users)
                _logger.LogInformation("Applying assigned engineer filter only: AssignedEngineer in [{EngineerNames}]", 
                    string.Join(", ", assignedEngineerNames));
                activeQuery = activeQuery.Where(t => t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer));
            }

            // Apply other filters
            if (categoryId.HasValue)
                activeQuery = activeQuery.Where(t => t.CategoryId == categoryId.Value);

            if (!string.IsNullOrEmpty(statusFilter) && Enum.TryParse<DomainTaskStatus>(statusFilter, out var status))
                activeQuery = activeQuery.Where(t => t.Status == status);

            if (!string.IsNullOrEmpty(searchQuery))
                activeQuery = activeQuery.Where(t => t.Description.Contains(searchQuery) || 
                                       (t.SerialNumber != null && t.SerialNumber.Contains(searchQuery)) ||
                                       (t.PartNumber != null && t.PartNumber.Contains(searchQuery)));

            if (priorityId.HasValue)
                activeQuery = activeQuery.Where(t => t.PriorityId == priorityId.Value);

            if (fromDate.HasValue)
                activeQuery = activeQuery.Where(t => t.CreatedAt >= fromDate.Value);

            if (toDate.HasValue)
                activeQuery = activeQuery.Where(t => t.CreatedAt <= toDate.Value);

            if (reopenedFilter.HasValue && reopenedFilter.Value)
                activeQuery = activeQuery.Where(t => t.IsReopened == true || (t.Comments != null && t.Comments.Contains("[REOPENED by")));

            // Apply Amendment Filters using the amendment_requests table
            if (!string.IsNullOrEmpty(amendmentStatusFilter))
            {
                var amendmentQuery = _context.AmendmentRequests.AsQueryable();
                
                switch (amendmentStatusFilter.ToLower())
                {
                    case "pending_tl":
                        amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Pending TL Review");
                        break;
                    case "forwarded":
                        amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Forwarded to Director");
                        break;
                    case "approved":
                        amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Approved");
                        break;
                    case "rejected":
                        amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Rejected");
                        break;
                    case "pending":
                        amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Pending TL Review" || ar.Status == "Forwarded to Director");
                        break;
                }

                var taskIdsWithAmendments = await amendmentQuery.Select(ar => ar.TaskId).Distinct().ToListAsync();
                activeQuery = activeQuery.Where(t => taskIdsWithAmendments.Contains(t.TaskId));
            }

            // Check if we need to include completed tasks
            var includeCompletedTasks = !string.IsNullOrEmpty(amendmentStatusFilter);

            if (!includeCompletedTasks)
            {
                var totalCount = await activeQuery.CountAsync();
                var tasks = await activeQuery
                    .OrderByDescending(t => t.CreatedAt)
                    .Skip((pageNumber - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                // ENHANCED: Log sample tasks for debugging
                if ((createdByUserIds != null && createdByUserIds.Any()) || (assignedEngineerNames != null && assignedEngineerNames.Any()))
                {
                    _logger.LogInformation("Sample active tasks after filtering:");
                    foreach (var task in tasks.Take(3))
                    {
                        _logger.LogInformation("  - Task {TaskId}: CreatedBy={CreatedBy}, AssignedEngineer={AssignedEngineer}, Task.ShopId={TaskShopId}, Creator.ShopId={CreatorShopId}, ShopName={ShopName}", 
                            task.TaskId, task.CreatedBy, task.AssignedEngineer, task.ShopId, task.Creator?.ShopId, 
                            task.Shop?.Name ?? task.Creator?.Shop?.Name ?? "Unknown");
                    }
                }
                
                return (tasks, totalCount);
            }
            else
            {
                _logger.LogInformation("Amendment filter detected - including completed tasks with amendment data");

                var completedQuery = _context.CompletedTasks
                    .Where(ct => ct.RecordStatus == RecordStatus.Active)
                    .Include(ct => ct.Creator)
                        .ThenInclude(c => c.Shop)
                    .Include(ct => ct.Shop)
                    .Include(ct => ct.Category)
                    .Include(ct => ct.Priority)
                    .Include(ct => ct.AmendmentReviewer)
                    .Include(ct => ct.ReopenedByUser)
                    .AsQueryable();

                // CRITICAL FIX: Apply user filter OR assigned engineer filter to completed tasks as well
                if (createdByUserIds != null && createdByUserIds.Any())
                {
                    if (assignedEngineerNames != null && assignedEngineerNames.Any())
                    {
                        _logger.LogInformation("Applying combined filter to completed tasks: CreatedBy in [{UserIds}] OR AssignedEngineer in [{EngineerNames}]", 
                            string.Join(", ", createdByUserIds), string.Join(", ", assignedEngineerNames));
                        
                        completedQuery = completedQuery.Where(t => 
                            createdByUserIds.Contains(t.CreatedBy) || 
                            (t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer)));
                    }
                    else
                    {
                        _logger.LogInformation("Applying user filter to completed tasks: CreatedBy in [{UserIds}]", string.Join(", ", createdByUserIds));
                        completedQuery = completedQuery.Where(t => createdByUserIds.Contains(t.CreatedBy));
                    }
                }
                else if (assignedEngineerNames != null && assignedEngineerNames.Any())
                {
                    _logger.LogInformation("Applying assigned engineer filter to completed tasks: AssignedEngineer in [{EngineerNames}]", 
                        string.Join(", ", assignedEngineerNames));
                    completedQuery = completedQuery.Where(t => t.AssignedEngineer != null && assignedEngineerNames.Contains(t.AssignedEngineer));
                }

                // Apply filters to Completed Tasks
                if (categoryId.HasValue)
                    completedQuery = completedQuery.Where(t => t.CategoryId == categoryId.Value);

                if (!string.IsNullOrEmpty(statusFilter) && Enum.TryParse<DomainTaskStatus>(statusFilter, out var statusVal))
                    completedQuery = completedQuery.Where(t => t.Status == statusVal);

                if (!string.IsNullOrEmpty(searchQuery))
                    completedQuery = completedQuery.Where(t => t.Description.Contains(searchQuery) || 
                                           (t.SerialNumber != null && t.SerialNumber.Contains(searchQuery)) ||
                                           (t.PartNumber != null && t.PartNumber.Contains(searchQuery)));

                if (priorityId.HasValue)
                    completedQuery = completedQuery.Where(t => t.PriorityId == priorityId.Value);

                if (fromDate.HasValue)
                    completedQuery = completedQuery.Where(t => t.TaskCreatedAt >= fromDate.Value);

                if (toDate.HasValue)
                    completedQuery = completedQuery.Where(t => t.TaskCreatedAt <= toDate.Value);

                if (reopenedFilter.HasValue && reopenedFilter.Value)
                    completedQuery = completedQuery.Where(t => t.IsReopened == true || (t.Comments != null && t.Comments.Contains("[REOPENED by")));

                // Apply Amendment Filters to Completed Tasks
                if (!string.IsNullOrEmpty(amendmentStatusFilter))
                {
                    var amendmentQuery = _context.AmendmentRequests.AsQueryable();
                    
                    switch (amendmentStatusFilter.ToLower())
                    {
                        case "pending_tl":
                            amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Pending TL Review");
                            break;
                        case "forwarded":
                            amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Forwarded to Director");
                            break;
                        case "approved":
                            amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Approved");
                            break;
                        case "rejected":
                            amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Rejected");
                            break;
                        case "pending":
                            amendmentQuery = amendmentQuery.Where(ar => ar.Status == "Pending TL Review" || ar.Status == "Forwarded to Director");
                            break;
                    }

                    var taskIdsWithAmendments = await amendmentQuery.Select(ar => ar.TaskId).Distinct().ToListAsync();
                    completedQuery = completedQuery.Where(t => taskIdsWithAmendments.Contains(t.OriginalTaskId));
                }

                // Execute both queries
                var activeTasks = await activeQuery.ToListAsync();
                var completedTasks = await completedQuery.ToListAsync();

                // Map CompletedTasks to TaskEntity in memory
                var mappedCompletedTasks = completedTasks.Select(ct => new TaskEntity
                {
                    TaskId = ct.OriginalTaskId,
                    SerialNumber = ct.SerialNumber,
                    PartNumber = ct.PartNumber,
                    PoNumber = ct.PoNumber,
                    Description = ct.Description,
                    CategoryId = ct.CategoryId,
                    SubTypeId = ct.SubTypeId,
                    RequestTypeId = ct.RequestTypeId,
                    Status = ct.Status,
                    Comments = ct.Comments,
                    AssignedEngineer = ct.AssignedEngineer,
                    PriorityId = ct.PriorityId,
                    EstimatedCompletionDate = ct.EstimatedCompletionDate,
                    TargetCompletionDate = ct.TargetCompletionDate,
                    ActualCompletionDate = ct.ActualCompletionDate,
                    AttachmentPath = ct.AttachmentPath,
                    AmendmentRequest = ct.AmendmentRequest,
                    AmendmentStatus = ct.AmendmentStatus,
                    AmendmentReviewedByTlId = ct.AmendmentReviewedByTlId,
                    IsReopened = ct.IsReopened,
                    ReopenCount = ct.ReopenCount,
                    ReopenedBy = ct.ReopenedBy,
                    ReopenedAt = ct.ReopenedAt,
                    ReopenReason = ct.ReopenReason,
                    ShopId = ct.ShopId,
                    CreatedBy = ct.CreatedBy,
                    CreatedAt = ct.TaskCreatedAt,
                    UpdatedAt = ct.TaskUpdatedAt,
                    Creator = ct.Creator,
                    Shop = ct.Shop,
                    Category = ct.Category,
                    Priority = ct.Priority,
                    AmendmentReviewer = ct.AmendmentReviewer,
                    ReopenedByUser = ct.ReopenedByUser,
                    Attachments = new List<TaskAttachment>(),
                    TaskComments = new List<TaskComment>()
                });

                var allTasks = activeTasks.Concat(mappedCompletedTasks).OrderByDescending(t => t.CreatedAt).ToList();
                
                var totalCount = allTasks.Count;
                var pagedTasks = allTasks.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList();

                _logger.LogInformation("Combined Search: Active={ActiveCount}, Completed={CompletedCount}, Total={TotalCount}", 
                    activeTasks.Count, completedTasks.Count, totalCount);

                return (pagedTasks, totalCount);
            }
        }

        // CRITICAL FIX: Properly handle IsDuplicate and DuplicateJustification fields when creating tasks
        // ENHANCED: Ensure ShopId is always set from creator's shop if not provided
        public async System.Threading.Tasks.Task<TaskEntity> CreateTaskAsync(TaskEntity task)
        {
            // CRITICAL FIX: If ShopId is not set, get it from the creator's shop
            if (!task.ShopId.HasValue && task.CreatedBy > 0)
            {
                var creator = await _context.Users
                    .Include(u => u.Shop)
                    .FirstOrDefaultAsync(u => u.UserId == task.CreatedBy);
                
                if (creator != null && creator.ShopId.HasValue)
                {
                    task.ShopId = creator.ShopId.Value;
                    _logger.LogInformation("Task ShopId not provided, setting from creator's shop: ShopId={ShopId}, ShopName={ShopName}", 
                        creator.ShopId, creator.Shop?.Name ?? "Unknown");
                }
                else
                {
                    _logger.LogWarning("Creator {CreatedBy} has no shop assigned, task will be created without ShopId", task.CreatedBy);
                }
            }

            // Set AssignedAt when task is created with an assigned engineer
            if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
            {
                task.AssignedAt = DateTime.UtcNow;
                _logger.LogInformation("Setting AssignedAt={AssignedAt} for new task assigned to {Engineer}", 
                    task.AssignedAt, task.AssignedEngineer);
            }

            // Log duplicate status for debugging
            _logger.LogInformation("Creating task with IsDuplicate={IsDuplicate}, DuplicateJustification={Justification}, ShopId={ShopId}", 
                task.IsDuplicate, task.DuplicateJustification, task.ShopId);

            _context.Tasks.Add(task);
            await _context.SaveChangesAsync();

            // Reload task with all navigation properties to ensure Shop is loaded
            var savedTask = await GetTaskByIdAsync(task.TaskId);
            if (savedTask != null)
            {
                _logger.LogInformation("Task {TaskId} saved successfully. ShopId={ShopId}, Shop.Name={ShopName}, Creator.ShopId={CreatorShopId}, Creator.Shop.Name={CreatorShopName}", 
                    savedTask.TaskId, savedTask.ShopId, savedTask.Shop?.Name, savedTask.Creator?.ShopId, savedTask.Creator?.Shop?.Name);
            }

            // Log creation in update history
            await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
            {
                TaskId = task.TaskId,
                UpdatedByUserId = task.CreatedBy,
                UpdatedByUserName = task.Creator?.FullName ?? "System",
                UpdatedByUserRole = task.Creator?.Role.ToString() ?? "Unknown",
                UpdateType = "TASK_CREATED",
                FieldName = "Task",
                OldValue = null,
                NewValue = $"Task TC-{task.TaskId} created",
                UpdateComment = "Initial task creation",
                UpdatedAt = DateTime.UtcNow
            });

            if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
            {
                var engineerNames = task.AssignedEngineer.Split(',').Select(e => e.Trim());
                await _notificationService.NotifyAssignedEngineersAsync(task.TaskId, engineerNames);
            }

            return savedTask ?? task;
        }

        public async System.Threading.Tasks.Task<TaskEntity> UpdateTaskAsync(TaskEntity task, int updatedByUserId, string updatedByUserName)
        {
            var existingTask = await _context.Tasks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.TaskId == task.TaskId);

            if (existingTask != null)
            {
                // Track changes for update history
                var changes = new Dictionary<string, (string? oldValue, string? newValue)>();

                // FIXED: Always track status changes even if no other fields change
                if (existingTask.Status != task.Status)
                {
                    changes["Status"] = (existingTask.Status.ToString(), task.Status.ToString());
                    var changedBy = updatedByUserName ?? "System";
                    await _notificationService.NotifyTaskStatusChangeAsync(task.TaskId, task.Status.ToString(), changedBy);

                    // BUG FIX: Set StatusChangedAt when status changes for synchronization
                    // This ensures overdue indicators and status-dependent logic stay in sync
                    task.StatusChangedAt = DateTime.UtcNow;
                    _logger.LogInformation("Status changed for task {TaskId}: {OldStatus} -> {NewStatus}, StatusChangedAt={StatusChangedAt}",
                        task.TaskId, existingTask.Status, task.Status, task.StatusChangedAt);
                }

                // FIXED: Improved AssignedEngineer comparison to handle null/empty string vs "Unassigned"
                var existingAssigned = string.IsNullOrEmpty(existingTask.AssignedEngineer) ? "Unassigned" : existingTask.AssignedEngineer;
                var newAssigned = string.IsNullOrEmpty(task.AssignedEngineer) ? "Unassigned" : task.AssignedEngineer;
                
                if (existingAssigned != newAssigned)
                {
                    changes["AssignedEngineer"] = (existingTask.AssignedEngineer, task.AssignedEngineer);
                    if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
                    {
                        // Update AssignedAt when engineer is assigned or changed
                        task.AssignedAt = DateTime.UtcNow;
                        _logger.LogInformation("Updating AssignedAt={AssignedAt} for task {TaskId} assigned to {Engineer}", 
                            task.AssignedAt, task.TaskId, task.AssignedEngineer);

                        var engineerNames = task.AssignedEngineer.Split(',').Select(e => e.Trim());
                        await _notificationService.NotifyAssignedEngineersAsync(task.TaskId, engineerNames);
                    }
                    else
                    {
                        // Clear AssignedAt when engineer is unassigned
                        task.AssignedAt = null;
                        _logger.LogInformation("Clearing AssignedAt for task {TaskId} (engineer unassigned)", task.TaskId);
                    }
                }

                if (existingTask.PriorityId != task.PriorityId)
                {
                    changes["PriorityId"] = (existingTask.PriorityId.ToString(), task.PriorityId.ToString());
                }

                if (existingTask.TargetCompletionDate != task.TargetCompletionDate)
                {
                    changes["TargetCompletionDate"] = (
                        existingTask.TargetCompletionDate?.ToString("yyyy-MM-dd"),
                        task.TargetCompletionDate?.ToString("yyyy-MM-dd")
                    );
                }

                if (existingTask.Description != task.Description)
                {
                    changes["Description"] = (
                        existingTask.Description?.Length > 100 ? existingTask.Description.Substring(0, 100) + "..." : existingTask.Description,
                        task.Description?.Length > 100 ? task.Description.Substring(0, 100) + "..." : task.Description
                    );
                }

                if (existingTask.RevisionNotes != task.RevisionNotes)
                {
                    changes["RevisionNotes"] = (existingTask.RevisionNotes, task.RevisionNotes);
                }

                if (existingTask.ShowRevisionAlert != task.ShowRevisionAlert)
                {
                    changes["ShowRevisionAlert"] = (existingTask.ShowRevisionAlert.ToString(), task.ShowRevisionAlert.ToString());
                }

                // Log update history
                var user = await _context.Users.FindAsync(updatedByUserId);
                
                if (changes.Any())
                {
                    // Log specific field changes
                    await _updateHistoryService.LogTaskUpdateWithChangesAsync(
                        task.TaskId,
                        updatedByUserId,
                        updatedByUserName ?? "System",
                        user?.Role.ToString() ?? "Unknown",
                        changes,
                        task.Comments,
                        null
                    );
                }
                else
                {
                    // Log a general update when no specific fields changed
                    await _updateHistoryService.LogTaskUpdateAsync(new TaskUpdateHistory
                    {
                        TaskId = task.TaskId,
                        UpdatedByUserId = updatedByUserId,
                        UpdatedByUserName = updatedByUserName ?? "System",
                        UpdatedByUserRole = user?.Role.ToString() ?? "Unknown",
                        UpdateType = "GENERAL_UPDATE",
                        FieldName = "Task",
                        OldValue = null,
                        NewValue = $"Task TC-{task.TaskId} updated",
                        UpdateComment = task.Comments,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }
            else
            {
                _logger.LogWarning("Task {TaskId} not found when attempting to update", task.TaskId);
            }

            _context.Tasks.Update(task);
            await _context.SaveChangesAsync();
            
            // Reload task with all navigation properties to ensure Shop is loaded
            var updatedTask = await GetTaskByIdAsync(task.TaskId);
            return updatedTask ?? task;
        }

        public async System.Threading.Tasks.Task<bool> DeleteTaskAsync(int taskId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null) return false;

            // Soft delete: mark as inactive instead of removing
            // This avoids FK constraint violations from related records
            // (comments, attachments, update history, interventions, etc.)
            task.RecordStatus = RecordStatus.Inactive;
            task.UpdatedAt = DateTime.UtcNow;
            
            _context.Tasks.Update(task);
            await _context.SaveChangesAsync();
            return true;
        }


        public async System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetTasksByUserIdAsync(int userId)
        {
            return await _context.Tasks
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
                .Where(t => t.CreatedBy == userId)
                .ToListAsync();
        }

        public async System.Threading.Tasks.Task<PerformanceMetrics> GetUserPerformanceMetricsAsync(int userId)
        {
            var userTasks = await GetTasksByUserIdAsync(userId);
            var totalTasks = userTasks.Count();
            var completedTasks = userTasks.Count(t => t.Status == DomainTaskStatus.Completed);
            var pendingTasks = userTasks.Count(t => t.Status == DomainTaskStatus.Pending);
            var overdueTasks = userTasks.Count(t => t.EstimatedCompletionDate < DateTime.Now && t.Status != DomainTaskStatus.Completed);

            return new PerformanceMetrics
            {
                TotalTasks = totalTasks,
                TasksCompleted = completedTasks,
                PendingTasks = pendingTasks,
                OverdueTasks = overdueTasks,
                CompletionRate = totalTasks > 0 ? (double)completedTasks / totalTasks : 0,
                AvgDelay = 0
            };
        }

        public async System.Threading.Tasks.Task<DashboardMetrics> GetDashboardMetricsAsync()
        {
            var allTasks = await GetAllTasksAsync();
            var totalTasks = allTasks.Count();
            var completedTasks = allTasks.Count(t => t.Status == DomainTaskStatus.Completed);
            var pendingTasks = allTasks.Count(t => t.Status == DomainTaskStatus.Pending);
            var inProgressTasks = allTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
            var overdueTasks = allTasks.Count(t => t.EstimatedCompletionDate < DateTime.Now && t.Status != DomainTaskStatus.Completed);

            return new DashboardMetrics
            {
                TotalTasks = totalTasks,
                CompletedTasks = completedTasks,
                PendingTasks = pendingTasks,
                InProgressTasks = inProgressTasks,
                OverdueTasks = overdueTasks,
                CompletionRate = totalTasks > 0 ? (double)completedTasks / totalTasks : 0,
                AverageCompletionTime = "0 days",
                RecentTasks = allTasks.OrderByDescending(t => t.CreatedAt).Take(5)
            };
        }

        // UPDATED: Get intervention requests from database
        public async System.Threading.Tasks.Task<IEnumerable<InterventionRequest>> GetInterventionRequestsAsync(int taskId)
        {
            var dbInterventions = await _context.InterventionRequests
                .Where(ir => ir.TaskId == taskId && ir.RecordStatus == RecordStatus.Active)
                .Include(ir => ir.RequestedByUser)
                .Include(ir => ir.AcknowledgedByUser)
                .Include(ir => ir.ResolvedByUser)
                .OrderByDescending(ir => ir.CreatedAt)
                .ToListAsync();

            return dbInterventions.Select(ir => new InterventionRequest
            {
                Id = ir.InterventionId,
                TaskId = ir.TaskId,
                RequestedBy = ir.RequestedBy,
                RequestedAt = ir.RequestedAt,
                EscalationLevel = ir.EscalationLevel,
                Status = ir.Status,
                Comments = ir.Comments ?? string.Empty,
                UserRole = ir.UserRole ?? string.Empty,
                AcknowledgedAt = ir.AcknowledgedAt,
                AcknowledgedBy = ir.AcknowledgedBy,
                ResolvedAt = ir.ResolvedAt,
                ResolvedBy = ir.ResolvedBy,
                CreatedAt = ir.CreatedAt
            });
        }

        // UPDATED: Update intervention request in database
        public async System.Threading.Tasks.Task UpdateInterventionRequestAsync(InterventionRequest interventionRequest)
        {
            var dbIntervention = await _context.InterventionRequests
                .FirstOrDefaultAsync(ir => ir.InterventionId == interventionRequest.Id);

            if (dbIntervention != null)
            {
                dbIntervention.Status = interventionRequest.Status;
                dbIntervention.AcknowledgedAt = interventionRequest.AcknowledgedAt;
                dbIntervention.AcknowledgedBy = interventionRequest.AcknowledgedBy;
                dbIntervention.ResolvedAt = interventionRequest.ResolvedAt;
                dbIntervention.ResolvedBy = interventionRequest.ResolvedBy;
                dbIntervention.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
            }
        }

        // UPDATED: Create intervention request in database
        public async System.Threading.Tasks.Task CreateInterventionRequestAsync(InterventionRequest interventionRequest)
        {
            var dbIntervention = new CMT.Domain.Models.InterventionRequest
            {
                TaskId = interventionRequest.TaskId,
                RequestedBy = interventionRequest.RequestedBy,
                RequestedAt = interventionRequest.RequestedAt,
                EscalationLevel = interventionRequest.EscalationLevel,
                Status = interventionRequest.Status,
                Comments = interventionRequest.Comments,
                UserRole = interventionRequest.UserRole,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                RegisteredBy = "System",
                RegisteredDate = DateTime.UtcNow,
                LastUpdateDate = DateTime.UtcNow,
                UpdatedBy = "System",
                StartDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                EndDate = new DateTime(9999, 12, 31, 23, 59, 59, DateTimeKind.Utc),
                TimeZoneInfo = "UTC",
                RecordStatus = RecordStatus.Active,
                IsReadOnly = false
            };

            _context.InterventionRequests.Add(dbIntervention);
            await _context.SaveChangesAsync();
        }

        // Get task comments from database
        public async System.Threading.Tasks.Task<IEnumerable<TaskComment>> GetTaskCommentsAsync(int taskId)
        {
            return await _context.TaskComments
                .Where(c => c.TaskId == taskId)
                .Include(c => c.Author)
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();
        }

        // Add comment to task in database
        public async System.Threading.Tasks.Task<TaskComment> AddCommentAsync(TaskComment comment)
        {
            _context.TaskComments.Add(comment);
            await _context.SaveChangesAsync();
            
            // Reload with navigation properties
            return await _context.TaskComments
                .Include(c => c.Author)
                .FirstOrDefaultAsync(c => c.CommentId == comment.CommentId) ?? comment;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SOFT-DELETE MANAGEMENT METHODS (Admin only)
        // ═══════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retrieve all soft-deleted tasks (RecordStatus == Inactive).
        /// These are tasks that were "deleted" via DeleteTaskAsync which sets RecordStatus = Inactive.
        /// </summary>
        public async System.Threading.Tasks.Task<IEnumerable<TaskEntity>> GetSoftDeletedTasksAsync()
        {
            return await _context.Tasks
                .Where(t => t.RecordStatus == RecordStatus.Inactive)
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
                .OrderByDescending(t => t.UpdatedAt)
                .ToListAsync();
        }

        /// <summary>
        /// Permanently hard-delete a soft-deleted task and all its related records
        /// (comments, attachments, update history, interventions) from the database.
        /// Only tasks with RecordStatus == Inactive can be permanently deleted.
        /// </summary>
        public async System.Threading.Tasks.Task<bool> PermanentlyDeleteTaskAsync(int taskId)
        {
            var task = await _context.Tasks
                .Include(t => t.TaskComments)
                .Include(t => t.Attachments)
                .FirstOrDefaultAsync(t => t.TaskId == taskId);

            if (task == null)
                return false;

            // Safety check: only allow permanent deletion of soft-deleted (Inactive) tasks
            if (task.RecordStatus != RecordStatus.Inactive)
            {
                throw new InvalidOperationException(
                    "Only soft-deleted (Inactive) tasks can be permanently deleted. " +
                    "Please soft-delete the task first before permanently removing it.");
            }

            // Remove related records first to avoid FK constraint violations
            // 1. Remove task comments
            var comments = await _context.TaskComments
                .Where(c => c.TaskId == taskId)
                .ToListAsync();
            if (comments.Any())
            {
                _context.TaskComments.RemoveRange(comments);
                _logger.LogInformation("Removing {Count} comments for task {TaskId}", comments.Count, taskId);
            }

            // 2. Remove task attachments
            var attachments = await _context.TaskAttachments
                .Where(a => a.TaskId == taskId)
                .ToListAsync();
            if (attachments.Any())
            {
                _context.TaskAttachments.RemoveRange(attachments);
                _logger.LogInformation("Removing {Count} attachments for task {TaskId}", attachments.Count, taskId);
            }

            // 3. Remove task update history
            var updateHistory = await _context.TaskUpdateHistories
                .Where(h => h.TaskId == taskId)
                .ToListAsync();
            if (updateHistory.Any())
            {
                _context.TaskUpdateHistories.RemoveRange(updateHistory);
                _logger.LogInformation("Removing {Count} update history records for task {TaskId}", updateHistory.Count, taskId);
            }

            // 4. Remove intervention requests
            var interventions = await _context.InterventionRequests
                .Where(ir => ir.TaskId == taskId)
                .ToListAsync();
            if (interventions.Any())
            {
                _context.InterventionRequests.RemoveRange(interventions);
                _logger.LogInformation("Removing {Count} intervention requests for task {TaskId}", interventions.Count, taskId);
            }

            // 5. Remove amendment requests
            var amendments = await _context.AmendmentRequests
                .Where(ar => ar.TaskId == taskId)
                .ToListAsync();
            if (amendments.Any())
            {
                _context.AmendmentRequests.RemoveRange(amendments);
                _logger.LogInformation("Removing {Count} amendment requests for task {TaskId}", amendments.Count, taskId);
            }

            // Finally, remove the task itself
            _context.Tasks.Remove(task);

            try
            {
                await _context.SaveChangesAsync();
                _logger.LogInformation("Task {TaskId} and all related records permanently deleted from database.", taskId);
                return true;
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "Failed to permanently delete task {TaskId}", taskId);
                throw new InvalidOperationException(
                    $"Cannot permanently delete task TC-{taskId} due to remaining related records. " +
                    $"Error: {ex.InnerException?.Message ?? ex.Message}");
            }
        }

        /// <summary>
        /// Restore a soft-deleted task by setting its RecordStatus back to Active.
        /// </summary>
        public async System.Threading.Tasks.Task<bool> RestoreTaskAsync(int taskId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return false;

            // Safety check: only restore tasks that are currently Inactive
            if (task.RecordStatus != RecordStatus.Inactive)
            {
                throw new InvalidOperationException(
                    $"Task TC-{taskId} is not in a soft-deleted (Inactive) state. Current RecordStatus: {task.RecordStatus}");
            }

            task.RecordStatus = RecordStatus.Active;
            task.UpdatedAt = DateTime.UtcNow;

            _context.Tasks.Update(task);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Task {TaskId} restored to Active status.", taskId);
            return true;
        }
    }
}