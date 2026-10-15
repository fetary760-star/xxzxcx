using CMT.Application.DTOs;
using CMT.Application.Common;
using CMT.Application.Services;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TaskEntity = CMT.Domain.Models.Task;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public class DuplicateDetectionService : IDuplicateDetectionService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<DuplicateDetectionService> _logger;
        private readonly INotificationService _notificationService;

        public DuplicateDetectionService(
            ApplicationDbContext context, 
            ILogger<DuplicateDetectionService> logger,
            INotificationService notificationService)
        {
            _context = context;
            _logger = logger;
            _notificationService = notificationService;
        }

        public async System.Threading.Tasks.Task<OperationResult<DuplicateCheckResponse>> CheckDuplicatesAsync(DuplicateCheckRequest request)
        {
            var result = new OperationResult<DuplicateCheckResponse>();

            try
            {
                _logger.LogInformation("Checking duplicates for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                    request.SerialNumber, request.PartNumber);

                var response = new DuplicateCheckResponse();

                // Build query for active tasks
                var activeQuery = _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active)
                    .Include(t => t.Creator)
                    .Include(t => t.Shop)
                    .Include(t => t.Category)
                    .Include(t => t.Priority)
                    .Include(t => t.SubType)
                    .AsQueryable();

                // Apply duplicate detection logic
                var duplicateQuery = activeQuery.Where(t => 
                    (t.SerialNumber == request.SerialNumber && !string.IsNullOrEmpty(request.SerialNumber)) ||
                    (t.PartNumber == request.PartNumber && !string.IsNullOrEmpty(request.PartNumber)) ||
                    (!string.IsNullOrEmpty(request.PoNumber) && t.PoNumber == request.PoNumber));

                // Exclude completed tasks unless specifically requested
                if (!request.IncludeCompleted)
                {
                    duplicateQuery = duplicateQuery.Where(t => t.Status != DomainTaskStatus.Completed);
                }

                var duplicateTasks = await duplicateQuery.ToListAsync();

                // Include completed tasks if requested
                var completedDuplicates = new List<TaskEntity>();
                if (request.IncludeCompleted)
                {
                    var completedQuery = _context.CompletedTasks
                        .Where(ct => ct.RecordStatus == RecordStatus.Active)
                        .Where(ct => 
                            (ct.SerialNumber == request.SerialNumber && !string.IsNullOrEmpty(request.SerialNumber)) ||
                            (ct.PartNumber == request.PartNumber && !string.IsNullOrEmpty(request.PartNumber)) ||
                            (!string.IsNullOrEmpty(request.PoNumber) && ct.PoNumber == request.PoNumber))
                        .Include(ct => ct.Creator)
                        .Include(ct => ct.Shop)
                        .Include(ct => ct.Category)
                        .Include(ct => ct.Priority);

                    var completedTasksData = await completedQuery.ToListAsync();
                    
                    // Map completed tasks to TaskEntity for consistent processing
                    completedDuplicates = completedTasksData.Select(ct => new TaskEntity
                    {
                        TaskId = ct.OriginalTaskId,
                        SerialNumber = ct.SerialNumber,
                        PartNumber = ct.PartNumber,
                        PoNumber = ct.PoNumber,
                        Description = ct.Description,
                        CategoryId = ct.CategoryId,
                        SubTypeId = ct.SubTypeId,
                        Status = ct.Status,
                        AssignedEngineer = ct.AssignedEngineer,
                        PriorityId = ct.PriorityId,
                        CreatedAt = ct.TaskCreatedAt,
                        UpdatedAt = ct.TaskUpdatedAt,
                        CreatedBy = ct.CreatedBy,
                        IsDuplicate = ct.IsDuplicate,
                        DuplicateJustification = ct.DuplicateJustification,
                        AttachmentPath = ct.AttachmentPath,
                        ShopId = ct.ShopId,
                        ActualCompletionDate = ct.ActualCompletionDate,
                        TargetCompletionDate = ct.TargetCompletionDate,
                        EstimatedCompletionDate = ct.EstimatedCompletionDate,
                        Creator = ct.Creator,
                        Shop = ct.Shop,
                        Category = ct.Category,
                        Priority = ct.Priority
                    }).ToList();
                }

                // Combine all duplicates
                var allDuplicates = duplicateTasks.Concat(completedDuplicates).ToList();

                if (allDuplicates.Any())
                {
                    response.IsDuplicate = true;
                    response.TotalDuplicates = allDuplicates.Count();
                    
                    // Convert to DTOs with similarity scoring
                    response.Duplicates = allDuplicates.Select(t => MapToDuplicateDto(t, request)).ToList();

                    // Perform analysis
                    response.Analysis = AnalyzeDuplicates(allDuplicates, request);
                    
                    response.Message = $"Found {allDuplicates.Count} potential duplicate(s)";
                    
                    _logger.LogInformation("Found {Count} duplicates for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                        allDuplicates.Count, request.SerialNumber, request.PartNumber);
                }
                else
                {
                    response.IsDuplicate = false;
                    response.Message = "No duplicates found";
                    
                    _logger.LogInformation("No duplicates found for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                        request.SerialNumber, request.PartNumber);
                }

                result.Payload = response;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking duplicates for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                    request.SerialNumber, request.PartNumber);
                result.AddError(ErrorCode.ServerError, $"Failed to check duplicates: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<DuplicateCheckResponse>> AdvancedDuplicateCheckAsync(DuplicateCheckRequest request)
        {
            var result = new OperationResult<DuplicateCheckResponse>();

            try
            {
                _logger.LogInformation("Advanced duplicate check for SerialNumber: {SerialNumber}, PartNumber: {PartNumber}", 
                    request.SerialNumber, request.PartNumber);

                // First perform standard duplicate check
                var standardResult = await CheckDuplicatesAsync(request);
                if (!standardResult.IsSuccess)
                {
                    return standardResult;
                }

                var response = standardResult.Payload!;

                // Enhanced similarity detection using fuzzy matching
                if (!response.IsDuplicate && !string.IsNullOrEmpty(request.Description))
                {
                    var potentialMatches = await FindSimilarTasksByDescriptionAsync(request);
                    if (potentialMatches.Any())
                    {
                        response.IsDuplicate = true;
                        response.Duplicates.AddRange(potentialMatches);
                        response.TotalDuplicates += potentialMatches.Count;
                        response.Analysis.PartialMatches = potentialMatches.Count;
                        response.Analysis.RecommendedActions.Add("Review similar descriptions for potential duplicates");
                        response.Message += $" (including {potentialMatches.Count} similar description matches)";
                    }
                }

                // Risk assessment
                if (response.IsDuplicate)
                {
                    response.Analysis.RiskLevel = AssessRiskLevel(response.Duplicates);
                    response.Analysis.RecommendedActions.AddRange(GetRecommendedActions(response.Duplicates));
                }

                result.Payload = response;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in advanced duplicate check");
                result.AddError(ErrorCode.ServerError, $"Advanced duplicate check failed: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<(IEnumerable<DuplicateTaskDto> duplicates, int totalCount)>> GetDuplicateTasksAsync(DuplicateFilterRequest request)
        {
            var result = new OperationResult<(IEnumerable<DuplicateTaskDto>, int)>();

            try
            {
                var query = _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active)
                    .Include(t => t.Creator)
                    .Include(t => t.Shop)
                    .Include(t => t.Category)
                    .Include(t => t.Priority)
                    .Include(t => t.SubType)
                    .AsQueryable();

                // Filter for duplicates only if requested
                if (request.ShowDuplicatesOnly)
                {
                    query = query.Where(t => t.IsDuplicate == true);
                }

                // Apply other filters
                if (request.CategoryId.HasValue)
                {
                    query = query.Where(t => t.CategoryId == request.CategoryId.Value);
                }

                if (request.FromDate.HasValue)
                {
                    query = query.Where(t => t.CreatedAt >= request.FromDate.Value);
                }

                if (request.ToDate.HasValue)
                {
                    query = query.Where(t => t.CreatedAt <= request.ToDate.Value);
                }

                if (!string.IsNullOrEmpty(request.SearchQuery))
                {
                    query = query.Where(t => 
                        t.Description.Contains(request.SearchQuery) ||
                        (t.SerialNumber != null && t.SerialNumber.Contains(request.SearchQuery)) ||
                        (t.PartNumber != null && t.PartNumber.Contains(request.SearchQuery)));
                }

                var totalCount = await query.CountAsync();
                
                var tasks = await query
                    .OrderByDescending(t => t.CreatedAt)
                    .Skip((request.Page - 1) * request.PageSize)
                    .Take(request.PageSize)
                    .ToListAsync();

                var duplicateDtos = tasks.Select(t => MapToDuplicateDto(t, null)).ToList();

                result.Payload = (duplicateDtos, totalCount);
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate tasks");
                result.AddError(ErrorCode.ServerError, $"Failed to get duplicate tasks: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<bool>> ProcessDuplicatesAsync(ProcessDuplicateRequest request, int userId)
        {
            var result = new OperationResult<bool>();

            try
            {
                _logger.LogInformation("Processing duplicates: {TaskIds}, Action: {Action}, User: {UserId}", 
                    string.Join(",", request.TaskIds), request.Action, userId);

                var tasks = await _context.Tasks
                    .Where(t => request.TaskIds.Contains(t.TaskId) && t.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                if (!tasks.Any())
                {
                    result.AddError(ErrorCode.NotFound, "No tasks found to process");
                    return result;
                }

                switch (request.Action.ToLower())
                {
                    case "mark_duplicate":
                        await MarkTasksAsDuplicate(tasks, request.Notes, userId);
                        break;
                    case "keep_separate":
                        await MarkTasksAsSeparate(tasks, request.Notes, userId);
                        break;
                    case "merge":
                        if (request.PrimaryTaskId.HasValue)
                        {
                            await MergeTasks(tasks, request.PrimaryTaskId.Value, request.Notes, userId);
                        }
                        else
                        {
                            result.AddError(ErrorCode.ValidationError, "Primary task ID required for merge action");
                            return result;
                        }
                        break;
                    default:
                        result.AddError(ErrorCode.ValidationError, "Invalid action specified");
                        return result;
                }

                // FIXED: Create individual alerts for each duplicate task instead of grouped alerts
                if (request.CreateAlert)
                {
                    await CreateIndividualDuplicateAlerts(request.TaskIds, request.Action, request.Notes, userId);
                }

                await _context.SaveChangesAsync();
                result.Payload = true;

                _logger.LogInformation("Successfully processed duplicates for tasks: {TaskIds}", 
                    string.Join(",", request.TaskIds));

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing duplicates");
                result.AddError(ErrorCode.ServerError, $"Failed to process duplicates: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<bool>> MarkAsDuplicateAsync(List<int> taskIds, string notes, int userId)
        {
            var result = new OperationResult<bool>();

            try
            {
                var tasks = await _context.Tasks
                    .Where(t => taskIds.Contains(t.TaskId) && t.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                foreach (var task in tasks)
                {
                    task.IsDuplicate = true;
                    task.DuplicateJustification = notes;
                    task.UpdatedAt = DateTime.UtcNow;
                }

                // FIXED: Create individual alerts for each task
                await CreateIndividualDuplicateAlerts(taskIds, "mark_duplicate", notes, userId);
                await _context.SaveChangesAsync();

                result.Payload = true;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking tasks as duplicate");
                result.AddError(ErrorCode.ServerError, $"Failed to mark as duplicate: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<IEnumerable<DuplicateAlertDto>>> GetDuplicateAlertsAsync(int? userId = null)
        {
            var result = new OperationResult<IEnumerable<DuplicateAlertDto>>();

            try
            {
                // FIXED: Get individual task alerts, not grouped alerts
                var alerts = await _context.Notifications
                    .Where(n => n.NotificationType == "duplicate" && n.RecordStatus == RecordStatus.Active)
                    .Where(n => !userId.HasValue || n.UserId == userId.Value)
                    .Where(n => n.TaskId.HasValue) // Only get alerts with specific task IDs
                    .Include(n => n.Recipient)
                    .OrderByDescending(n => n.CreatedAt)
                    .Take(100) // Increased limit since we now have individual alerts per task
                    .ToListAsync();

                var alertDtos = alerts.Select(n => new DuplicateAlertDto
                {
                    AlertId = n.NotificationId,
                    Title = "Duplicate Task",
                    Message = n.Message ?? "",
                    AlertType = "duplicate",
                    CreatedAt = n.CreatedAt,
                    IsRead = n.IsRead,
                    RelatedTaskIds = n.TaskId.HasValue ? new List<int> { n.TaskId.Value } : new List<int>(),
                    ActionRequired = n.ActionUrl ?? "",
                    CreatedBy = 0, // System generated
                    CreatedByName = "System"
                }).ToList();

                result.Payload = alertDtos;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate alerts");
                result.AddError(ErrorCode.ServerError, $"Failed to get alerts: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<bool>> MarkAlertAsReadAsync(int alertId, int userId)
        {
            var result = new OperationResult<bool>();

            try
            {
                var alert = await _context.Notifications
                    .FirstOrDefaultAsync(n => n.NotificationId == alertId && n.UserId == userId);

                if (alert == null)
                {
                    result.AddError(ErrorCode.NotFound, "Alert not found");
                    return result;
                }

                alert.IsRead = true;
                alert.ReadAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                result.Payload = true;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking alert as read");
                result.AddError(ErrorCode.ServerError, $"Failed to mark alert as read: {ex.Message}");
                return result;
            }
        }

        public async System.Threading.Tasks.Task<OperationResult<DuplicateStatistics>> GetDuplicateStatisticsAsync()
        {
            var result = new OperationResult<DuplicateStatistics>();

            try
            {
                var totalTasks = await _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var totalDuplicates = await _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active && t.IsDuplicate == true)
                    .CountAsync();

                var unprocessedDuplicates = await _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active && t.IsDuplicate == true && 
                               (t.DuplicateJustification == null || t.DuplicateJustification == ""))
                    .CountAsync();

                var duplicateAlertsCount = await _context.Notifications
                    .Where(n => n.NotificationType == "duplicate" && !n.IsRead && n.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var stats = new DuplicateStatistics
                {
                    TotalDuplicates = totalDuplicates,
                    UnprocessedDuplicates = unprocessedDuplicates,
                    ProcessedDuplicates = totalDuplicates - unprocessedDuplicates,
                    DuplicateAlertsCount = duplicateAlertsCount,
                    DuplicateRate = totalTasks > 0 ? (double)totalDuplicates / totalTasks * 100 : 0
                };

                result.Payload = stats;
                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting duplicate statistics");
                result.AddError(ErrorCode.ServerError, $"Failed to get statistics: {ex.Message}");
                return result;
            }
        }

        #region Private Helper Methods

        private DuplicateTaskDto MapToDuplicateDto(TaskEntity task, DuplicateCheckRequest? request)
        {
            var dto = new DuplicateTaskDto
            {
                TaskId = task.TaskId,
                SerialNumber = task.SerialNumber,
                PartNumber = task.PartNumber,
                PoNumber = task.PoNumber,
                Description = task.Description,
                CategoryId = task.CategoryId,
                CategoryName = task.Category?.Name,
                SubTypeId = task.SubTypeId,
                SubTypeName = task.SubType?.Name,
                Status = task.Status,
                Comments = task.Comments,
                AssignedEngineer = task.AssignedEngineer ?? "Unassigned",
                PriorityId = task.PriorityId ?? 0,
                PriorityName = task.Priority?.LevelName,
                CreatedAt = task.CreatedAt,
                UpdatedAt = task.UpdatedAt,
                CreatedBy = task.CreatedBy,
                CreatedByName = task.Creator?.FullName,
                IsDuplicate = task.IsDuplicate,
                DuplicateJustification = task.DuplicateJustification,
                AttachmentPath = task.AttachmentPath,
                ShopId = task.ShopId,
                ShopName = task.Shop?.Name,
                ActualCompletionDate = task.ActualCompletionDate,
                TargetCompletionDate = task.TargetCompletionDate,
                EstimatedCompletionDate = task.EstimatedCompletionDate,
                HasNotes = !string.IsNullOrEmpty(task.Comments) || !string.IsNullOrEmpty(task.DuplicateJustification),
                IsProcessed = task.IsDuplicate && !string.IsNullOrEmpty(task.DuplicateJustification)
            };

            // Calculate similarity score if request is provided
            if (request != null)
            {
                dto.SimilarityScore = CalculateSimilarityScore(task, request);
                dto.MatchingFields = GetMatchingFields(task, request);
            }

            return dto;
        }

        private double CalculateSimilarityScore(TaskEntity task, DuplicateCheckRequest request)
        {
            double score = 0;
            int totalFields = 0;

            // Serial number match (weight: 30%)
            if (!string.IsNullOrEmpty(request.SerialNumber) && !string.IsNullOrEmpty(task.SerialNumber))
            {
                totalFields++;
                if (string.Equals(task.SerialNumber, request.SerialNumber, StringComparison.OrdinalIgnoreCase))
                    score += 0.3;
            }

            // Part number match (weight: 30%)
            if (!string.IsNullOrEmpty(request.PartNumber) && !string.IsNullOrEmpty(task.PartNumber))
            {
                totalFields++;
                if (string.Equals(task.PartNumber, request.PartNumber, StringComparison.OrdinalIgnoreCase))
                    score += 0.3;
            }

            // PO number match (weight: 20%)
            if (!string.IsNullOrEmpty(request.PoNumber) && !string.IsNullOrEmpty(task.PoNumber))
            {
                totalFields++;
                if (string.Equals(task.PoNumber, request.PoNumber, StringComparison.OrdinalIgnoreCase))
                    score += 0.2;
            }

            // Description similarity (weight: 20%)
            if (!string.IsNullOrEmpty(request.Description) && !string.IsNullOrEmpty(task.Description))
            {
                totalFields++;
                var similarity = CalculateStringSimilarity(task.Description, request.Description);
                score += similarity * 0.2;
            }

            return totalFields > 0 ? score : 0;
        }

        private List<string> GetMatchingFields(TaskEntity task, DuplicateCheckRequest request)
        {
            var matchingFields = new List<string>();

            if (!string.IsNullOrEmpty(request.SerialNumber) && 
                string.Equals(task.SerialNumber, request.SerialNumber, StringComparison.OrdinalIgnoreCase))
                matchingFields.Add("Serial Number");

            if (!string.IsNullOrEmpty(request.PartNumber) && 
                string.Equals(task.PartNumber, request.PartNumber, StringComparison.OrdinalIgnoreCase))
                matchingFields.Add("Part Number");

            if (!string.IsNullOrEmpty(request.PoNumber) && 
                string.Equals(task.PoNumber, request.PoNumber, StringComparison.OrdinalIgnoreCase))
                matchingFields.Add("PO Number");

            if (request.CategoryId.HasValue && task.CategoryId == request.CategoryId.Value)
                matchingFields.Add("Category");

            if (request.SubTypeId.HasValue && task.SubTypeId == request.SubTypeId.Value)
                matchingFields.Add("Sub Type");

            return matchingFields;
        }

        private double CalculateStringSimilarity(string str1, string str2)
        {
            if (string.IsNullOrEmpty(str1) || string.IsNullOrEmpty(str2))
                return 0;

            // Simple Levenshtein distance-based similarity
            var distance = LevenshteinDistance(str1.ToLower(), str2.ToLower());
            var maxLength = Math.Max(str1.Length, str2.Length);
            return maxLength == 0 ? 1 : 1.0 - (double)distance / maxLength;
        }

        private int LevenshteinDistance(string s1, string s2)
        {
            if (string.IsNullOrEmpty(s1)) return s2?.Length ?? 0;
            if (string.IsNullOrEmpty(s2)) return s1.Length;

            var matrix = new int[s1.Length + 1, s2.Length + 1];

            for (int i = 0; i <= s1.Length; i++)
                matrix[i, 0] = i;
            for (int j = 0; j <= s2.Length; j++)
                matrix[0, j] = j;

            for (int i = 1; i <= s1.Length; i++)
            {
                for (int j = 1; j <= s2.Length; j++)
                {
                    int cost = s1[i - 1] == s2[j - 1] ? 0 : 1;
                    matrix[i, j] = Math.Min(
                        Math.Min(matrix[i - 1, j] + 1, matrix[i, j - 1] + 1),
                        matrix[i - 1, j - 1] + cost);
                }
            }

            return matrix[s1.Length, s2.Length];
        }

        private async System.Threading.Tasks.Task<List<DuplicateTaskDto>> FindSimilarTasksByDescriptionAsync(DuplicateCheckRequest request)
        {
            // This is a simplified implementation. In production, you might use full-text search or AI services
            var tasks = await _context.Tasks
                .Where(t => t.RecordStatus == RecordStatus.Active && 
                           t.Description.Contains(request.Description!.Substring(0, Math.Min(50, request.Description!.Length))))
                .Include(t => t.Creator)
                .Include(t => t.Shop)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Take(10)
                .ToListAsync();

            return tasks.Select(t => MapToDuplicateDto(t, request))
                       .Where(dto => dto.SimilarityScore > 0.7) // Only high similarity matches
                       .ToList();
        }

        private DuplicateAnalysisResult AnalyzeDuplicates(List<TaskEntity> duplicates, DuplicateCheckRequest request)
        {
            var analysis = new DuplicateAnalysisResult();

            foreach (var duplicate in duplicates)
            {
                var matchingFields = GetMatchingFields(duplicate, request);
                
                if (matchingFields.Count >= 2) // Exact match on 2+ fields
                {
                    analysis.ExactMatches++;
                }
                else
                {
                    analysis.PartialMatches++;
                }

                if (duplicate.Status == DomainTaskStatus.Completed)
                {
                    analysis.CompletedDuplicates++;
                }
                else
                {
                    analysis.ActiveDuplicates++;
                }
            }

            return analysis;
        }

        private string AssessRiskLevel(List<DuplicateTaskDto> duplicates)
        {
            var activeDuplicates = duplicates.Count(d => d.Status != DomainTaskStatus.Completed);
            var exactMatches = duplicates.Count(d => d.SimilarityScore >= 0.8);

            if (activeDuplicates >= 3 || exactMatches >= 2)
                return "High";
            else if (activeDuplicates >= 2 || exactMatches >= 1)
                return "Medium";
            else
                return "Low";
        }

        private List<string> GetRecommendedActions(List<DuplicateTaskDto> duplicates)
        {
            var actions = new List<string>();

            var activeDuplicates = duplicates.Where(d => d.Status != DomainTaskStatus.Completed).ToList();
            
            if (activeDuplicates.Count > 1)
            {
                actions.Add("Consider merging active duplicate tasks");
                actions.Add("Review task assignments to avoid resource conflicts");
            }

            var unprocessedDuplicates = duplicates.Where(d => !d.IsProcessed).ToList();
            if (unprocessedDuplicates.Any())
            {
                actions.Add("Add justification notes for duplicate tasks");
            }

            if (duplicates.Any(d => string.IsNullOrEmpty(d.Comments)))
            {
                actions.Add("Add detailed comments to distinguish between similar tasks");
            }

            return actions;
        }

        private async System.Threading.Tasks.Task MarkTasksAsDuplicate(List<TaskEntity> tasks, string notes, int userId)
        {
            foreach (var task in tasks)
            {
                task.IsDuplicate = true;
                task.DuplicateJustification = notes;
                task.UpdatedAt = DateTime.UtcNow;

                // Add comment about duplicate marking
                var comment = new TaskComment
                {
                    TaskId = task.TaskId,
                    AuthorId = userId,
                    Content = $"[MARKED AS DUPLICATE] {notes}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CMT.Domain.Enums.CommentType.SystemEvent
                };

                _context.TaskComments.Add(comment);
            }
        }

        private async System.Threading.Tasks.Task MarkTasksAsSeparate(List<TaskEntity> tasks, string notes, int userId)
        {
            foreach (var task in tasks)
            {
                task.IsDuplicate = false;
                task.DuplicateJustification = $"Reviewed and marked as separate: {notes}";
                task.UpdatedAt = DateTime.UtcNow;

                // Add comment about separate marking
                var comment = new TaskComment
                {
                    TaskId = task.TaskId,
                    AuthorId = userId,
                    Content = $"[MARKED AS SEPARATE] {notes}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CMT.Domain.Enums.CommentType.SystemEvent
                };

                _context.TaskComments.Add(comment);
            }
        }

        private async System.Threading.Tasks.Task MergeTasks(List<TaskEntity> tasks, int primaryTaskId, string notes, int userId)
        {
            var primaryTask = tasks.FirstOrDefault(t => t.TaskId == primaryTaskId);
            if (primaryTask == null)
            {
                throw new ArgumentException("Primary task not found in the list of tasks to merge");
            }

            var tasksToMerge = tasks.Where(t => t.TaskId != primaryTaskId).ToList();

            foreach (var task in tasksToMerge)
            {
                // Mark as duplicate and reference primary task
                task.IsDuplicate = true;
                task.DuplicateJustification = $"Merged into task {primaryTaskId}: {notes}";
                task.Status = DomainTaskStatus.Rejected;
                task.UpdatedAt = DateTime.UtcNow;

                // Add merge comment to both tasks
                var mergeComment = new TaskComment
                {
                    TaskId = task.TaskId,
                    AuthorId = userId,
                    Content = $"[MERGED INTO TASK {primaryTaskId}] {notes}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CMT.Domain.Enums.CommentType.SystemEvent
                };

                _context.TaskComments.Add(mergeComment);

                // Add reference comment to primary task
                var primaryComment = new TaskComment
                {
                    TaskId = primaryTaskId,
                    AuthorId = userId,
                    Content = $"[MERGED FROM TASK {task.TaskId}] {notes}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CMT.Domain.Enums.CommentType.SystemEvent
                };

                _context.TaskComments.Add(primaryComment);
            }

            // Update primary task
            primaryTask.DuplicateJustification = $"Primary task for merge operation: {notes}";
            primaryTask.UpdatedAt = DateTime.UtcNow;
        }

        // FIXED: New method to create individual alerts for each duplicate task
        private async System.Threading.Tasks.Task CreateIndividualDuplicateAlerts(List<int> taskIds, string action, string notes, int userId)
        {
            foreach (var taskId in taskIds)
            {
                var notification = new Notification
                {
                    Message = $"Task TC-{taskId} marked as duplicate. Action: {action}. {notes}",
                    NotificationType = "duplicate",
                    Priority = "High",
                    UserId = userId,
                    TaskId = taskId, // Individual task ID for each alert
                    RelatedEntity = taskId.ToString(), // Single task ID, not comma-separated
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
            }
        }

        // DEPRECATED: Old method that created grouped alerts - keeping for reference but not used
        private async System.Threading.Tasks.Task CreateDuplicateAlert(List<int> taskIds, string action, string notes, int userId)
        {
            // This method is deprecated - use CreateIndividualDuplicateAlerts instead
            var notification = new Notification
            {
                Message = $"Action '{action}' performed on tasks: {string.Join(", ", taskIds)}. Notes: {notes}",
                NotificationType = "duplicate",
                Priority = "High",
                UserId = userId,
                TaskId = taskIds.FirstOrDefault(),
                RelatedEntity = string.Join(",", taskIds),
                ActionUrl = "/tasks/duplicates",
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
        }

        private List<int> ParseTaskIds(string? relatedData)
        {
            if (string.IsNullOrEmpty(relatedData))
                return new List<int>();

            return relatedData.Split(',')
                             .Where(s => int.TryParse(s.Trim(), out _))
                             .Select(s => int.Parse(s.Trim()))
                             .ToList();
        }

        #endregion
    }
}