using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Web.Api.Attributes;
using CMT.Domain.Models;
using CMT.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MediatR;
using CMT.Application.Commands.Tasks;
using CMT.Application.Queries;
using CMT.Application.Common;
using System.Security.Claims;
using CMTAuthorizationService = CMT.Application.Interfaces.IAuthorizationService;
using TaskStatusEnum = CMT.Domain.Enums.TaskStatus;
using TaskEntity = CMT.Domain.Models.Task;
using CMT.Application.Services;
using DomainAmendmentStatus = CMT.Domain.Enums.AmendmentStatus;
using DTOAmendmentStatus = CMT.Application.DTOs.AmendmentStatus;
using CMT.Domain.Enums;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/tasks")]
    [Authorize] 
    public class TaskController : ControllerBase
    {
        private readonly ITaskService _taskService;
        private readonly ICompletedTaskService _completedTaskService;
        private readonly CMTAuthorizationService _authorizationService;
        private readonly IMediator _mediator;
        private readonly ILogger<TaskController> _logger;
        private readonly IAmendmentService _amendmentService;
        private readonly IEnhancedAmendmentService _enhancedAmendmentService;
        private readonly INotificationService _notificationService;
        private readonly IUserService _userService;
        private readonly ITaskUpdateHistoryService _taskUpdateHistoryService;
        private readonly ITaskHoldService _taskHoldService;
        private readonly IDirectorService _directorService;

        public TaskController(
            ITaskService taskService, 
            ICompletedTaskService completedTaskService,
            CMTAuthorizationService authorizationService, 
            IMediator mediator,
            ILogger<TaskController> logger,
            IAmendmentService amendmentService,
            IEnhancedAmendmentService enhancedAmendmentService,
            INotificationService notificationService,
            IUserService userService,
            ITaskUpdateHistoryService taskUpdateHistoryService,
            ITaskHoldService taskHoldService,
            IDirectorService directorService)
        {
            _taskService = taskService;
            _completedTaskService = completedTaskService;
            _authorizationService = authorizationService;
            _mediator = mediator;
            _logger = logger;
            _amendmentService = amendmentService;
            _enhancedAmendmentService = enhancedAmendmentService;
            _notificationService = notificationService;
            _userService = userService;
            _taskUpdateHistoryService = taskUpdateHistoryService;
            _taskHoldService = taskHoldService;
            _directorService = directorService;
        }

        /// <summary>
        /// CRITICAL FIX: GetCurrentUser now resolves the role from the database when the JWT role claim is missing.
        /// Previously, a null role claim defaulted to "customer", causing permission checks to fail
        /// for users who actually have elevated roles (e.g., team_leader).
        /// </summary>
        private async Task<(int UserId, string UserName, string UserRole)> GetCurrentUserAsync()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            _logger.LogInformation("Current User Claims: Id='{UserId}', Name='{UserName}', Role='{UserRole}'", userIdClaim, userName, userRole);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                _logger.LogWarning("Could not find authenticated user. This may cause issues.");
                return (1, "System", "system");
            }

            // CRITICAL FIX: If role claim is missing from JWT, look it up from the database
            if (string.IsNullOrEmpty(userRole))
            {
                _logger.LogWarning("Role claim is null for user {UserId}. Attempting to resolve from database.", userId);
                try
                {
                    var dbUser = await _userService.GetUserByIdAsync(userId);
                    if (dbUser != null && !string.IsNullOrEmpty(dbUser.Role))
                    {
                        userRole = dbUser.Role;
                        _logger.LogInformation("Resolved role from database for user {UserId}: '{Role}'", userId, userRole);
                    }
                    else
                    {
                        userRole = "customer";
                        _logger.LogWarning("Could not resolve role from database for user {UserId}. Defaulting to 'customer'.", userId);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error resolving role from database for user {UserId}. Defaulting to 'customer'.", userId);
                    userRole = "customer";
                }
            }

            return (userId, userName ?? "Unknown", userRole);
        }

        /// <summary>
        /// Synchronous version for backward compatibility - delegates to async version.
        /// NOTE: Prefer GetCurrentUserAsync() in all new code.
        /// </summary>
        private (int UserId, string UserName, string UserRole) GetCurrentUser()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var userRole = User.FindFirstValue(ClaimTypes.Role);

            _logger.LogInformation("Current User Claims: Id='{UserId}', Name='{UserName}', Role='{UserRole}'", userIdClaim, userName, userRole);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                _logger.LogWarning("Could not find authenticated user. This may cause issues.");
                return (1, "System", "system");
            }

            return (userId, userName ?? "Unknown", userRole ?? "customer");
        }

        /// <summary>
        /// Helper method to check if user is an engineer
        /// Supports multiple role formats: engineer, eng, Engineer, Eng
        /// </summary>
        private bool IsEngineerRole(string userRole)
        {
            if (string.IsNullOrEmpty(userRole))
                return false;

            var role = userRole.ToLower().Replace("_", "");
            return role == "engineer" || role == "eng";
        }

        /// <summary>
        /// BUSINESS RULE: Only Team Leaders and Directors may change a task's
        /// TargetCompletionDate (date AND time).
        ///
        /// Engineers, Shop TLs, customers and customer personnel can still save other
        /// fields (status, comments, revision notes...), but any TargetCompletionDate
        /// they submit is ignored and the stored value is preserved. This prevents the
        /// target from silently regressing to the Task Assigned date, which corrupted
        /// the engineer's actual completion / variance metrics.
        ///
        /// NOTE: shop_tl is explicitly EXCLUDED even though it contains "tl".
        /// </summary>
        /// <summary>
        /// Normalizes any incoming DateTime into a real UTC instant.
        ///
        /// The API stores every timestamp as UTC, but a value arriving from the client
        /// (or materialized by EF Core) can carry Kind = Utc, Local or Unspecified.
        /// Persisting it without normalization is what made the stored Target Completion
        /// drift against the value the Team Leader actually selected.
        ///
        /// Returns null for missing/default values so callers can preserve the previously
        /// stored target instead of clearing it.
        /// </summary>
        private static DateTime? NormalizeToUtc(DateTime? value)
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

        private bool CanEditTargetCompletionDate(string? userRole)
        {
            if (string.IsNullOrEmpty(userRole))
                return false;

            // Normalize: lowercase and strip spaces/underscores/hyphens so that
            // "team_leader", "Team Leader" and "TeamLeader" all match.
            var normalized = userRole.ToLower().Trim().Replace("_", "").Replace("-", "").Replace(" ", "");

            // Shop TL must never be treated as a Team Leader for this permission.
            if (normalized == "shoptl")
                return false;

            return normalized == "teamleader" || normalized == "teamlead" || normalized == "director";
        }

        /// <summary>
        /// CRITICAL FIX: Helper method to check if a user role is allowed to approve/reject completions.
        /// Uses normalized comparison that properly handles underscores and case variations.
        /// Allowed roles: team_leader, team_lead, teamleader, admin, director, shop_tl
        /// </summary>
        private bool IsApprovalRole(string? userRole)
        {
            if (string.IsNullOrEmpty(userRole))
                return false;

            var normalizedRole = userRole.ToLower().Trim();
            
            // Check against all known role formats (both with and without underscores)
            var allowedRoles = new[] 
            { 
                "team_leader", "team_lead", "teamleader", "teamlead",
                "admin", "administrator",
                "director", 
                "shop_tl", "shoptl",
                "manager"
            };

            return allowedRoles.Contains(normalizedRole) || allowedRoles.Contains(normalizedRole.Replace("_", ""));
        }

        /// <summary>
        /// CRITICAL FIX: Returns a 403 Forbidden response with a JSON body containing the error message.
        /// This replaces the broken Forbid("message") calls which treated the message as an auth scheme name.
        /// </summary>
        private ObjectResult ForbidWithMessage(string message)
        {
            _logger.LogWarning("Access denied: {Message}", message);
            return StatusCode(403, new { success = false, error = message });
        }

        /// <summary>
        /// BUG FIX: Resolve the effective "Task Assigned At" value for display.
        /// Some legacy tasks were assigned before the AssignedAt column was tracked and therefore
        /// have AssignedAt = NULL even though an engineer is already assigned. In that case we
        /// fall back to UpdatedAt (the most recent change timestamp, which is the best available
        /// proxy for the assignment moment) or CreatedAt as a last resort, so the UI no longer
        /// shows "Not yet assigned" for tasks that already have an assigned engineer.
        /// </summary>
        private static DateTime? ResolveAssignedAt(string? assignedEngineer, DateTime? assignedAt, DateTime updatedAt, DateTime createdAt)
        {
            var hasEngineer = !string.IsNullOrWhiteSpace(assignedEngineer)
                && !string.Equals(assignedEngineer, "Unassigned", StringComparison.OrdinalIgnoreCase);

            if (!hasEngineer)
            {
                return null;
            }

            if (assignedAt.HasValue)
            {
                return assignedAt;
            }

            // Legacy fallback - prefer UpdatedAt over CreatedAt as the assignment proxy
            return updatedAt != default ? updatedAt : createdAt;
        }

        /// <summary>
        /// NEW: Get task update history - shows who made updates and when
        /// </summary>
        [HttpGet("{id}/update-history")]
        public async Task<ActionResult<IEnumerable<TaskUpdateHistoryDto>>> GetTaskUpdateHistory(int id)
        {
            try
            {
                _logger.LogInformation("GetTaskUpdateHistory called for task {TaskId}", id);
                
                var updateHistory = await _taskUpdateHistoryService.GetTaskUpdateHistoryAsync(id);
                
                var historyDtos = updateHistory.Select(h => new TaskUpdateHistoryDto
                {
                    UpdateHistoryId = h.UpdateHistoryId,
                    TaskId = h.TaskId,
                    UpdatedByUserId = h.UpdatedByUserId,
                    UpdatedByUserName = h.UpdatedByUserName,
                    UpdatedByUserRole = h.UpdatedByUserRole,
                    UpdateType = h.UpdateType,
                    FieldName = h.FieldName,
                    OldValue = h.OldValue,
                    NewValue = h.NewValue,
                    UpdateComment = h.UpdateComment,
                    UpdatedAt = h.UpdatedAt
                }).OrderByDescending(h => h.UpdatedAt).ToList();
                
                _logger.LogInformation("Returning {Count} update history entries for task {TaskId}", historyDtos.Count, id);
                
                return Ok(historyDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving update history for task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving update history", error = ex.Message });
            }
        }

        /// <summary>
        /// Get tasks with optional filtering (excludes completed tasks that have been moved) - ENHANCED with Amendment Support, Manager Filtering, and Director Filtering
        /// CRITICAL FIX: Now uses IDirectorService.GetDepartmentUserIdsAsync for proper director scoping
        /// UPDATED: Now also passes Team Leader names to filter by AssignedEngineer field for Directors
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<TaskDto>>> GetTasks(
            [FromQuery] int? categoryId = null,
            [FromQuery] string? status = null,
            [FromQuery] string? searchQuery = null,
            [FromQuery] int? priorityId = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] int pageNumber = 1,
            [FromQuery] int pageSize = 50,
            [FromQuery] string? amendmentStatusFilter = null,
            [FromQuery] bool? reopenedFilter = null)
        {
            try
            {
                _logger.LogInformation("GetTasks called with filters: categoryId={CategoryId}, status={Status}, amendmentStatusFilter={AmendmentStatusFilter}, reopenedFilter={ReopenedFilter}", 
                    categoryId, status, amendmentStatusFilter, reopenedFilter);

                var (userId, userName, userRole) = GetCurrentUser();
                
                // FIXED: Prepare user IDs for shop_tl, manager, and director filtering BEFORE calling GetTasksWithFiltersAsync
                IEnumerable<int>? createdByUserIds = null;
                // NEW: Prepare Team Leader names for director filtering by AssignedEngineer
                IEnumerable<string>? assignedEngineerNames = null;
                
                if (userRole?.ToLower() == "shop_tl")
                {
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        // Get all users created by this shop_tl
                        var createdUsers = await _userService.GetUsersByCreatorIdAsync(userId);
                        var createdUserIds = createdUsers.Select(u => u.UserId).ToList();
                        
                        // CRITICAL FIX: Include the shop_tl's own userId in the filter
                        var allUserIds = new List<int> { userId };
                        allUserIds.AddRange(createdUserIds);
                        
                        createdByUserIds = allUserIds;

                        _logger.LogInformation("Shop TL {UserId} filtering active tasks from users: {UserIds}", 
                            userId, string.Join(", ", allUserIds));
                    }
                }
                else if (userRole?.ToLower() == "manager")
                {
                    // CRITICAL FIX: Add Manager role filtering
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        _logger.LogInformation("Manager {UserId} detected, building task filter scope", userId);
                        
                        // Get all Shop Team Leaders managed by this Manager
                        var managedShopTLs = await _userService.GetManagedUsersAsync(userId);
                        var allManagedUserIds = new List<int>();
                        
                        foreach (var shopTL in managedShopTLs)
                        {
                            // Add the Shop TL themselves
                            allManagedUserIds.Add(shopTL.UserId);
                            
                            // Add all Customer Personnel created by this Shop TL
                            var createdByShopTL = await _userService.GetUsersByCreatorIdAsync(shopTL.UserId);
                            allManagedUserIds.AddRange(createdByShopTL.Select(u => u.UserId));
                        }
                        
                        createdByUserIds = allManagedUserIds;
                        
                        _logger.LogInformation("Manager {UserId} filtering active tasks from {Count} users: {UserIds}", 
                            userId, allManagedUserIds.Count, string.Join(", ", allManagedUserIds));
                    }
                }
                else if (userRole?.ToLower() == "director")
                {
                    // CRITICAL FIX: Use IDirectorService.GetDepartmentUserIdsAsync for proper director scoping
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        _logger.LogInformation("Director {UserId} detected, using DirectorService to get department users and Team Leader names", userId);
                        
                        // Use the proper DirectorService method that respects departments.director_id
                        var departmentUserIds = await _directorService.GetDepartmentUserIdsAsync(userId);
                        
                        // CRITICAL FIX: Get Team Leader names created by this Director for AssignedEngineer filtering
                        var teamLeaderNames = await _directorService.GetDirectorTeamLeaderNamesAsync(userId);
                        
                        if ((departmentUserIds == null || !departmentUserIds.Any()) && (teamLeaderNames == null || !teamLeaderNames.Any()))
                        {
                            _logger.LogWarning("Director {UserId} has no assigned departments, users, or Team Leaders", userId);
                            createdByUserIds = new List<int>(); // Empty list - no tasks
                        }
                        else
                        {
                            _logger.LogInformation("Director {UserId} filtering active tasks from {UserCount} users in their departments AND tasks assigned to {TLCount} Team Leaders: [{TLNames}]", 
                                userId, departmentUserIds?.Count ?? 0, teamLeaderNames?.Count ?? 0, 
                                teamLeaderNames != null ? string.Join(", ", teamLeaderNames) : "none");
                            
                            createdByUserIds = departmentUserIds ?? new List<int>();
                            assignedEngineerNames = teamLeaderNames;
                        }
                    }
                }

                // FIXED: Pass createdByUserIds AND assignedEngineerNames to the service method for database-level filtering
                var (tasks, totalCount) = await _taskService.GetTasksWithFiltersAsync(
                    categoryId, status, searchQuery, priorityId, fromDate, toDate, pageNumber, pageSize,
                    amendmentStatusFilter, reopenedFilter, createdByUserIds, assignedEngineerNames);

                var taskDtos = tasks.Select(t => {
                    // DIAGNOSTIC LOGGING: Log shop information for each task
                    _logger.LogInformation("Task {TaskId} shop data: task.ShopId={TaskShopId}, task.Shop?.Name={TaskShopName}, task.Creator?.ShopId={CreatorShopId}, task.Creator?.Shop?.Name={CreatorShopName}",
                        t.TaskId, t.ShopId, t.Shop?.Name, t.Creator?.ShopId, t.Creator?.Shop?.Name);
                    
                    // Determine which fallback is used for ShopName
                    string shopNameUsed;
                    string shopNameSource;
                    if (t.Shop?.Name != null)
                    {
                        shopNameUsed = t.Shop.Name;
                        shopNameSource = "task.Shop.Name";
                    }
                    else if (t.Creator?.Shop?.Name != null)
                    {
                        shopNameUsed = t.Creator.Shop.Name;
                        shopNameSource = "task.Creator.Shop.Name";
                    }
                    else
                    {
                        shopNameUsed = "Unknown";
                        shopNameSource = "default fallback";
                    }
                    
                    _logger.LogInformation("Task {TaskId} ShopName resolution: using '{ShopName}' from {Source}",
                        t.TaskId, shopNameUsed, shopNameSource);
                    
                    return new TaskDto
                    {
                        TaskId = t.TaskId,
                        SerialNumber = t.SerialNumber ?? "",
                        PartNumber = t.PartNumber ?? "",
                        PoNumber = t.PoNumber ?? "",
                        Description = t.Description,
                        CategoryId = t.CategoryId,
                        CategoryName = t.Category?.Name ?? "Unknown",
                        Status = t.Status,
                        Comments = t.Comments,
                        AssignedEngineer = t.AssignedEngineer ?? "Unassigned",
                        PriorityId = t.PriorityId,
                        PriorityName = t.Priority?.LevelName ?? "Unknown",
                        EstimatedCompletionDate = t.EstimatedCompletionDate,
                        TargetCompletionDate = t.TargetCompletionDate,
                        ActualCompletionDate = t.ActualCompletionDate,
                        AttachmentPath = t.AttachmentPath,
                        AttachmentsCount = t.Attachments?.Count ?? (string.IsNullOrEmpty(t.AttachmentPath) ? 0 : 1),
                        ShopId = t.ShopId ?? t.Creator?.ShopId, // FIXED: Fallback to creator's shop if task.ShopId is null
                        ShopName = shopNameUsed, // Use the determined shop name
                        // FIXED: Populate PhoneExtension from the task creator's phone number
                        PhoneExtension = t.Creator?.PhoneNumber,
                        CreatedBy = t.CreatedBy,
                        CreatedByName = t.Creator?.FullName ?? "Unknown",
                        CreatedAt = t.CreatedAt,
                        UpdatedAt = t.UpdatedAt,
                        
                        // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                        StatusChangedAt = t.StatusChangedAt,
                        // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                        // but an already-assigned engineer show a real timestamp instead of
                        // "Not yet assigned" on the frontend.
                        AssignedAt = ResolveAssignedAt(t.AssignedEngineer, t.AssignedAt, t.UpdatedAt, t.CreatedAt),
                        
                        // Include amendment fields
                        AmendmentRequest = t.AmendmentRequest,
                        AmendmentStatus = t.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(t.AmendmentStatus.Value) : null,
                        AmendmentReviewedByTlId = t.AmendmentReviewedByTlId,
                        AmendmentReviewedByName = t.AmendmentReviewer?.FullName,
                        
                        // Include reopened fields
                        IsReopened = t.IsReopened,
                        ReopenCount = t.ReopenCount,
                        ReopenedBy = t.ReopenedBy,
                        ReopenedByName = t.ReopenedByUser?.FullName,
                        ReopenedAt = t.ReopenedAt,
                        ReopenReason = t.ReopenReason,

                        IsDuplicate = t.IsDuplicate,
                        DuplicateJustification = t.DuplicateJustification,

                        RevisionNotes = t.RevisionNotes,
                        ShowRevisionAlert = t.ShowRevisionAlert
                    };
                }).ToList();
                
                _logger.LogInformation("Returning {TaskCount} tasks out of {TotalCount} total", taskDtos.Count, totalCount);
                
                var response = new
                {
                    tasks = taskDtos,
                    pagination = new
                    {
                        page = pageNumber,
                        limit = pageSize,
                        total = totalCount,
                        totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
                    },
                    userRole = userRole,
                    success = true
                };
                
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving tasks");
                return StatusCode(500, new { message = "An error occurred while retrieving tasks", error = ex.Message });
            }
        }

        // HELPER: Map Domain AmendmentStatus to DTO AmendmentStatus
        private DTOAmendmentStatus MapDomainAmendmentStatusToDTO(DomainAmendmentStatus domainStatus)
        {
            return domainStatus switch
            {
                DomainAmendmentStatus.PendingTLReview => DTOAmendmentStatus.PendingTLReview,
                DomainAmendmentStatus.ForwardedToDirector => DTOAmendmentStatus.ForwardedToDirector,
                DomainAmendmentStatus.Approved => DTOAmendmentStatus.Approved,
                DomainAmendmentStatus.Rejected => DTOAmendmentStatus.Rejected,
                _ => DTOAmendmentStatus.PendingTLReview
            };
        }

        /// <summary>
        /// ENHANCED: Get completed tasks from the completed_tasks table with SHOP-LEVEL filtering for shop_tl, Manager filtering, and Director filtering
        /// CRITICAL FIX: Now uses IDirectorService.GetDepartmentUserIdsAsync for proper director scoping
        /// UPDATED: Now also passes Team Leader names to filter by AssignedEngineer field for Directors
        /// </summary>
        [HttpGet("completed")]
        public async Task<ActionResult<IEnumerable<CompletedTaskDto>>> GetCompletedTasks(
            [FromQuery] int? categoryId = null,
            [FromQuery] string? searchQuery = null,
            [FromQuery] int? priorityId = null,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] int pageNumber = 1,
            [FromQuery] int pageSize = 50)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                _logger.LogInformation("GetCompletedTasks called by user {UserId} ({UserName}) with role {UserRole}", 
                    userId, userName, userRole);
                
                // ENHANCED: Prepare SHOP-LEVEL filtering for shop_tl users, Manager filtering, and Director filtering
                IEnumerable<int>? createdByUserIds = null;
                int? shopIdFilter = null;
                // NEW: Prepare Team Leader names for director filtering by AssignedEngineer
                IEnumerable<string>? assignedEngineerNames = null;
                
                if (userRole?.ToLower() == "shop_tl")
                {
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null && currentUser.ShopId.HasValue)
                    {
                        _logger.LogInformation("Shop TL user detected: {UserId}, ShopId: {ShopId}, ShopName: {ShopName}", 
                            userId, currentUser.ShopId, currentUser.ShopName);
                        
                        // CRITICAL FIX: Set shop-level filter to ensure only tasks from this shop are shown
                        shopIdFilter = currentUser.ShopId.Value;
                        
                        // Get all users from the SAME SHOP who were created by this shop_tl
                        var createdUsers = await _userService.GetUsersByCreatorIdAsync(userId);
                        
                        // Filter to only include users from the same shop
                        var sameShopUsers = createdUsers
                            .Where(u => u.ShopId == currentUser.ShopId.Value)
                            .Select(u => u.UserId)
                            .ToList();
                        
                        _logger.LogInformation("Found {Count} users created by shop_tl {UserId} in shop {ShopId}: {UserIds}", 
                            sameShopUsers.Count, userId, currentUser.ShopId.Value, string.Join(", ", sameShopUsers));
                        
                        // Include the shop_tl's own userId + users they created from the same shop
                        var allUserIds = new List<int> { userId };
                        allUserIds.AddRange(sameShopUsers);
                        
                        createdByUserIds = allUserIds;

                        _logger.LogInformation("Shop TL {UserId} will see completed tasks from shop {ShopId}, created by users: {UserIds}", 
                            userId, shopIdFilter, string.Join(", ", allUserIds));
                        
                        // Log user details for debugging
                        foreach (var createdUser in createdUsers.Where(u => u.ShopId == currentUser.ShopId.Value))
                        {
                            _logger.LogInformation("  - User {UserId}: {UserName} (Role: {Role}, Shop: {ShopId})", 
                                createdUser.UserId, createdUser.FullName, createdUser.Role, createdUser.ShopId);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Shop TL user {UserId} has no shop assigned", userId);
                    }
                }
                else if (userRole?.ToLower() == "manager")
                {
                    // CRITICAL FIX: Add Manager role filtering for completed tasks
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        _logger.LogInformation("Manager user detected: {UserId}, building completed task filter scope", userId);
                        
                        // Get all Shop Team Leaders managed by this Manager
                        var managedShopTLs = await _userService.GetManagedUsersAsync(userId);
                        var allManagedUserIds = new List<int>();
                        
                        foreach (var shopTL in managedShopTLs)
                        {
                            // Add the Shop TL themselves
                            allManagedUserIds.Add(shopTL.UserId);
                            
                            // Add all Customer Personnel created by this Shop TL
                            var createdByShopTL = await _userService.GetUsersByCreatorIdAsync(shopTL.UserId);
                            allManagedUserIds.AddRange(createdByShopTL.Select(u => u.UserId));
                        }
                        
                        createdByUserIds = allManagedUserIds;
                        
                        _logger.LogInformation("Manager {UserId} will see completed tasks created by {Count} users: {UserIds}", 
                            userId, allManagedUserIds.Count, string.Join(", ", allManagedUserIds));
                    }
                    else
                    {
                        _logger.LogWarning("Manager user {UserId} not found", userId);
                    }
                }
                else if (userRole?.ToLower() == "director")
                {
                    // CRITICAL FIX: Use IDirectorService.GetDepartmentUserIdsAsync for proper director scoping
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        _logger.LogInformation("Director user detected: {UserId}, using DirectorService to get department users and Team Leader names for completed tasks", userId);
                        
                        // Use the proper DirectorService method that respects departments.director_id
                        var departmentUserIds = await _directorService.GetDepartmentUserIdsAsync(userId);
                        
                        // CRITICAL FIX: Get Team Leader names created by this Director for AssignedEngineer filtering
                        var teamLeaderNames = await _directorService.GetDirectorTeamLeaderNamesAsync(userId);
                        
                        if ((departmentUserIds == null || !departmentUserIds.Any()) && (teamLeaderNames == null || !teamLeaderNames.Any()))
                        {
                            _logger.LogWarning("Director {UserId} has no assigned departments, users, or Team Leaders, returning empty completed task list", userId);
                            createdByUserIds = new List<int>(); // Empty list - no tasks
                        }
                        else
                        {
                            _logger.LogInformation("Director {UserId} will see completed tasks from {UserCount} users in their departments AND tasks assigned to {TLCount} Team Leaders: [{TLNames}]", 
                                userId, departmentUserIds?.Count ?? 0, teamLeaderNames?.Count ?? 0,
                                teamLeaderNames != null ? string.Join(", ", teamLeaderNames) : "none");
                            
                            createdByUserIds = departmentUserIds ?? new List<int>();
                            assignedEngineerNames = teamLeaderNames;
                        }
                    }
                    else
                    {
                        _logger.LogWarning("Director user {UserId} not found", userId);
                    }
                }
                else if (userRole?.ToLower() == "shop_manager")
                {
                    // CRITICAL FIX: Add Shop Manager role filtering for completed tasks
                    // Shop Manager should see all completed tasks from their shop - same logic as active tasks
                    var currentUser = await _userService.GetUserByIdAsync(userId);
                    if (currentUser != null)
                    {
                        _logger.LogInformation("Shop Manager user detected: {UserId}, ShopId: {ShopId}, building completed task filter scope", 
                            userId, currentUser.ShopId);
                        
                        // Set shop-level filter to ensure only tasks from this shop are shown
                        if (currentUser.ShopId.HasValue)
                        {
                            shopIdFilter = currentUser.ShopId.Value;
                        }
                        
                        // Also build user ID list as fallback for tasks without ShopId
                        var allManagedUserIds = new List<int> { userId }; // Include self
                        
                        // Get all users visible to this shop manager (backend auto-scopes by shop)
                        var managedUsers = await _userService.GetManagedUsersAsync(userId);
                        foreach (var managedUser in managedUsers)
                        {
                            allManagedUserIds.Add(managedUser.UserId);
                            
                            // Also get users created by each managed user (customer personnel)
                            var createdByManaged = await _userService.GetUsersByCreatorIdAsync(managedUser.UserId);
                            allManagedUserIds.AddRange(createdByManaged.Select(u => u.UserId));
                        }
                        
                        // Also get users created directly by the shop manager
                        var createdByManager = await _userService.GetUsersByCreatorIdAsync(userId);
                        allManagedUserIds.AddRange(createdByManager.Select(u => u.UserId));
                        
                        createdByUserIds = allManagedUserIds.Distinct().ToList();
                        
                        _logger.LogInformation("Shop Manager {UserId} will see completed tasks from shop {ShopId} and/or created by {Count} users: {UserIds}", 
                            userId, shopIdFilter, createdByUserIds.Count(), string.Join(", ", createdByUserIds));
                    }
                    else
                    {
                        _logger.LogWarning("Shop Manager user {UserId} not found", userId);
                    }
                }
                else
                {
                    _logger.LogInformation("Non-shop_tl/manager/director/shop_manager user ({Role}), no filtering applied", userRole);
                }

                // FIXED: Pass createdByUserIds, shopIdFilter, AND assignedEngineerNames to ensure proper filtering
                var (completedTasks, totalCount) = await _completedTaskService.GetCompletedTasksWithFiltersAsync(
                    categoryId, searchQuery, priorityId, fromDate, toDate, pageNumber, pageSize,
                    null, null, createdByUserIds, shopIdFilter, assignedEngineerNames);

                _logger.LogInformation("Retrieved {TaskCount} completed tasks out of {TotalCount} total for user {UserId}", 
                    completedTasks.Count(), totalCount, userId);

                var taskDtos = completedTasks.Select(t => new CompletedTaskDto
                {
                    CompletedTaskId = t.CompletedTaskId,
                    OriginalTaskId = t.OriginalTaskId,
                    SerialNumber = t.SerialNumber ?? "",
                    PartNumber = t.PartNumber ?? "",
                    PoNumber = t.PoNumber ?? "",
                    Description = t.Description,
                    CategoryId = t.CategoryId,
                    CategoryName = t.Category?.Name ?? "Unknown",
                    Status = t.Status,
                    Comments = t.Comments,
                    AssignedEngineer = t.AssignedEngineer ?? "Unassigned",
                    PriorityId = t.PriorityId,
                    PriorityName = t.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = t.EstimatedCompletionDate,
                    TargetCompletionDate = t.TargetCompletionDate,
                    ActualCompletionDate = t.ActualCompletionDate,
                    AttachmentPath = t.AttachmentPath,
                    AttachmentsCount = t.Attachments?.Count ?? (string.IsNullOrEmpty(t.AttachmentPath) ? 0 : 1),
                    ShopId = t.ShopId ?? t.Creator?.ShopId, // CRITICAL FIX: Fallback to creator's ShopId
                    ShopName = t.Shop?.Name ?? t.Creator?.Shop?.Name ?? "Unknown", // CRITICAL FIX: Fallback to creator's shop name
                    CreatedBy = t.CreatedBy,
                    CreatedByName = t.Creator?.FullName ?? "Unknown",
                    TaskCreatedAt = t.TaskCreatedAt,
                    TaskUpdatedAt = t.TaskUpdatedAt,
                    CompletedAt = t.CompletedAt,
                    MovedToCompletedAt = t.MovedToCompletedAt,
                    // BUG FIX: Expose TaskAssignedAt for variance calculations on the frontend.
                    // Fall back to TaskUpdatedAt or TaskCreatedAt when the stored TaskAssignedAt
                    // is NULL for legacy tasks that were assigned before this field was tracked,
                    // so the UI no longer shows "Not yet assigned" for already-assigned tasks.
                    TaskAssignedAt = ResolveAssignedAt(t.AssignedEngineer, t.TaskAssignedAt, t.TaskUpdatedAt, t.TaskCreatedAt),
                    
                    // Include amendment and reopened fields for completed tasks too
                    AmendmentRequest = t.AmendmentRequest,
                    AmendmentStatus = t.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(t.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = t.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = t.AmendmentReviewer?.FullName,
                    IsReopened = t.IsReopened,
                    ReopenCount = t.ReopenCount,
                    ReopenedBy = t.ReopenedBy,
                    ReopenedByName = t.ReopenedByUser?.FullName,
                    ReopenedAt = t.ReopenedAt,
                    ReopenReason = t.ReopenReason,

                    // FIXED: Include IsDuplicate field for completed tasks
                    IsDuplicate = t.IsDuplicate,
                    DuplicateJustification = t.DuplicateJustification,

                    // Include revision fields in completed tasks response
                    RevisionNotes = t.RevisionNotes,
                    ShowRevisionAlert = t.ShowRevisionAlert
                }).ToList();
                
                // Log sample tasks for debugging
                if (taskDtos.Any())
                {
                    _logger.LogInformation("Sample completed tasks returned:");
                    foreach (var task in taskDtos.Take(3))
                    {
                        _logger.LogInformation("  - Task {TaskId} (Original: {OriginalId}): Shop {ShopId} ({ShopName}), Created by {CreatedBy} ({CreatedByName}), AssignedEngineer: {AssignedEngineer}, Completed: {CompletedAt}", 
                            task.CompletedTaskId, task.OriginalTaskId, task.ShopId, task.ShopName, task.CreatedBy, task.CreatedByName, task.AssignedEngineer, task.CompletedAt);
                    }
                }
                else
                {
                    _logger.LogWarning("No completed tasks found for user {UserId} with the given filters", userId);
                }
                
                var response = new
                {
                    tasks = taskDtos,
                    pagination = new
                    {
                        page = pageNumber,
                        limit = pageSize,
                        total = totalCount,
                        totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
                    },
                    userRole = userRole,
                    success = true
                };
                
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving completed tasks");
                return StatusCode(500, new { message = "An error occurred while retrieving completed tasks", error = ex.Message });
            }
        }

        /// <summary>
        /// Get comments for a completed task
        /// </summary>
        [HttpGet("completed/{id}/comments")]
        public async Task<ActionResult<IEnumerable<CompletedTaskCommentDto>>> GetCompletedTaskComments(int id)
        {
            try
            {
                var comments = await _completedTaskService.GetCompletedTaskCommentsAsync(id);
                
                var commentDtos = comments.Select(c => new CompletedTaskCommentDto
                {
                    CommentId = c.CommentId,
                    CompletedTaskId = c.CompletedTaskId,
                    CommentText = c.CommentText,
                    AuthorId = c.AuthorId,
                    AuthorName = c.Author?.FullName ?? "System",
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt
                }).OrderByDescending(c => c.CreatedAt).ToList();

                return Ok(commentDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving comments for completed task {CompletedTaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving comments", error = ex.Message });
            }
        }

        /// <summary>
        /// Get attachments for a completed task
        /// </summary>
        [HttpGet("completed/{id}/attachments")]
        public async Task<ActionResult<IEnumerable<CompletedTaskAttachmentDto>>> GetCompletedTaskAttachments(int id)
        {
            try
            {
                var attachments = await _completedTaskService.GetCompletedTaskAttachmentsAsync(id);
                
                var attachmentDtos = attachments.Select(a => new CompletedTaskAttachmentDto
                {
                    AttachmentId = a.AttachmentId,
                    CompletedTaskId = a.CompletedTaskId,
                    FileName = a.FileName,
                    FilePath = a.FilePath,
                    FileType = a.FileType,
                    FileSize = a.FileSize,
                    UploadedAt = a.UploadedAt
                }).OrderByDescending(a => a.UploadedAt).ToList();

                return Ok(attachmentDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving attachments for completed task {CompletedTaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving attachments", error = ex.Message });
            }
        }

        /// <summary>
        /// Get a specific task by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<ActionResult<TaskDto>> GetTask(int id)
        {
            try
            {
                var task = await _taskService.GetTaskByIdAsync(id);
                if (task == null)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                string? engineerPhone = null;
                if (!string.IsNullOrEmpty(task.AssignedEngineer) && task.AssignedEngineer != "Unassigned")
                {
                    // AssignedEngineer may contain multiple names comma-separated; take the first
                    var engineerName = task.AssignedEngineer.Split(',')[0].Trim();
                    var engineerUser = await _userService.GetUserByUsernameOrFullNameAsync(engineerName);
                    engineerPhone = engineerUser?.PhoneNumber;
                }

                var taskDto = new TaskDto
                {
                    TaskId = task.TaskId,
                    SerialNumber = task.SerialNumber ?? "",
                    PartNumber = task.PartNumber ?? "",
                    PoNumber = task.PoNumber ?? "",
                    Description = task.Description,
                    CategoryId = task.CategoryId,
                    CategoryName = task.Category?.Name ?? "Unknown",
                    Status = task.Status,
                    Comments = task.Comments,
                    AssignedEngineer = task.AssignedEngineer ?? "Unassigned",
                    PriorityId = task.PriorityId,
                    PriorityName = task.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = task.EstimatedCompletionDate,
                    TargetCompletionDate = task.TargetCompletionDate,
                    ActualCompletionDate = task.ActualCompletionDate,
                    AttachmentPath = task.AttachmentPath,
                    AttachmentsCount = task.Attachments?.Count ?? (string.IsNullOrEmpty(task.AttachmentPath) ? 0 : 1),
                    ShopId = task.ShopId ?? task.Creator?.ShopId,
                    ShopName = task.Shop?.Name ?? task.Creator?.Shop?.Name ?? "Unknown",
                    PhoneExtension = task.Creator?.PhoneNumber,
                    EngineerPhoneNumber = engineerPhone,
                    CreatedBy = task.CreatedBy,
                    CreatedByName = task.Creator?.FullName ?? "Unknown",
                    CreatedAt = task.CreatedAt,
                    UpdatedAt = task.UpdatedAt,
                    
                    // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                    StatusChangedAt = task.StatusChangedAt,
                    // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                    // but an already-assigned engineer show a real timestamp instead of
                    // "Not yet assigned" on the frontend.
                    AssignedAt = ResolveAssignedAt(task.AssignedEngineer, task.AssignedAt, task.UpdatedAt, task.CreatedAt),
                    
                    // Include amendment fields
                    AmendmentRequest = task.AmendmentRequest,
                    AmendmentStatus = task.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(task.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = task.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = task.AmendmentReviewer?.FullName,
                    
                    // Include reopened fields
                    IsReopened = task.IsReopened,
                    ReopenCount = task.ReopenCount,
                    ReopenedBy = task.ReopenedBy,
                    ReopenedByName = task.ReopenedByUser?.FullName,
                    ReopenedAt = task.ReopenedAt,
                    ReopenReason = task.ReopenReason,

                    IsDuplicate = task.IsDuplicate,
                    DuplicateJustification = task.DuplicateJustification,

                    RevisionNotes = task.RevisionNotes,
                    ShowRevisionAlert = task.ShowRevisionAlert
                };
                
                return Ok(taskDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving the task", error = ex.Message });
            }
        }

        /// <summary>
        /// Request Team Leader intervention with role-based access and escalation logic
        /// CRITICAL FIX: Replaced Forbid("message") with ForbidWithMessage() to avoid auth scheme lookup error
        /// </summary>
        [HttpPost("{id}/intervention")]
        public async Task<ActionResult> RequestIntervention(int id, [FromBody] InterventionRequestDto request)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                
                // Role-based access control - exclude Team Lead and Director
                var restrictedRoles = new[] { "team_lead", "team_leader", "director" };
                if (restrictedRoles.Contains(userRole.ToLower()))
                {
                    return ForbidWithMessage("Team Leaders and Directors cannot request intervention.");
                }
                
                if (string.IsNullOrWhiteSpace(request.intervention_comment_text ?? request.InterventionText))
                {
                    return BadRequest(new { error = "Intervention comment is required" });
                }

                var task = await _taskService.GetTaskByIdAsync(id);
                if (task == null)
                {
                    return NotFound(new { error = $"Task with ID {id} not found" });
                }

                // Don't allow intervention requests for completed tasks
                if (task.Status == TaskStatusEnum.Completed)
                {
                    return BadRequest(new { error = "Cannot request intervention for completed tasks" });
                }

                // Check for existing intervention requests and implement escalation logic
                var existingInterventions = await _taskService.GetInterventionRequestsAsync(id);
                var escalationLevel = "team_lead";
                var escalatedToDirector = false;

                // If there's an existing intervention to team lead with no response after 24 hours, escalate to director
                var teamLeadIntervention = existingInterventions
                    .Where(i => i.EscalationLevel == "team_lead" && i.Status == "pending")
                    .OrderByDescending(i => i.CreatedAt)
                    .FirstOrDefault();

                if (teamLeadIntervention != null && 
                    DateTime.UtcNow.Subtract(teamLeadIntervention.CreatedAt).TotalHours >= 24)
                {
                    escalationLevel = "director";
                    escalatedToDirector = true;
                    
                    // Update the previous intervention status
                    teamLeadIntervention.Status = "escalated";
                    await _taskService.UpdateInterventionRequestAsync(teamLeadIntervention);
                }

                // Create new intervention request
                var interventionRequest = new CMT.Application.Services.InterventionRequest
                {
                    TaskId = id,
                    RequestedBy = userId,
                    RequestedAt = DateTime.UtcNow,
                    EscalationLevel = escalationLevel,
                    Status = "pending",
                    Comments = request.intervention_comment_text ?? request.InterventionText ?? "",
                    UserRole = userRole
                };

                await _taskService.CreateInterventionRequestAsync(interventionRequest);

                // Add intervention comment to task comments with proper type
                var interventionComment = new TaskComment
                {
                    TaskId = id,
                    AuthorId = userId,
                    Content = $"[INTERVENTION REQUESTED by {userName} ({userRole})]\n" +
                             $"Escalation Level: {escalationLevel.ToUpper()}\n" +
                             $"{request.intervention_comment_text ?? request.InterventionText}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CommentType.InterventionRequest
                };

                await _taskService.AddCommentAsync(interventionComment);

                // Send notifications based on escalation level
                if (escalationLevel == "director")
                {
                    await _notificationService.NotifyDirectorsAsync(id, interventionRequest);
                }
                else
                {
                    await _notificationService.NotifyTeamLeadsAsync(id, interventionRequest);
                }

                // Update task timestamp
                task.UpdatedAt = DateTime.UtcNow;
                await _taskService.UpdateTaskAsync(task, userId, userName);

                _logger.LogInformation("Intervention requested for task {TaskId} by user {UserId} ({UserName}) - Escalation Level: {EscalationLevel}", 
                    id, userId, userName, escalationLevel);

                return Ok(new { 
                    success = true, 
                    message = escalatedToDirector 
                        ? "Intervention request escalated to Director due to no Team Lead response."
                        : "Intervention request submitted successfully. Team Leaders have been notified.",
                    taskId = id,
                    escalationLevel = escalationLevel,
                    escalatedToDirector = escalatedToDirector
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting intervention for task {TaskId}", id);
                return StatusCode(500, new { error = "An error occurred while requesting intervention", details = ex.Message });
            }
        }

        /// <summary>
        /// Get comments for a task with proper filtering and real-time support
        /// </summary>
        [HttpGet("{id}/comments")]
        public async Task<ActionResult<IEnumerable<CommentDto>>> GetTaskComments(int id)
        {
            try
            {
                var comments = await _taskService.GetTaskCommentsAsync(id);
                
                var commentDtos = comments.Select(c => new CommentDto
                {
                    CommentId = c.CommentId,
                    TaskId = c.TaskId,
                    Content = c.Content,
                    AuthorId = c.AuthorId,
                    AuthorName = c.Author?.FullName ?? "System",
                    CreatedAt = c.CreatedAt,
                    UpdatedAt = c.UpdatedAt,
                    CommentType = c.CommentType.ToString()
                }).OrderByDescending(c => c.CreatedAt).ToList();

                return Ok(commentDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving comments for task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while retrieving comments", error = ex.Message });
            }
        }

        /// <summary>
        /// Add comment to a task - also handles initial comments properly
        /// </summary>
        [HttpPost("{id}/comments")]
        public async Task<ActionResult<CommentDto>> AddTaskComment(int id, [FromBody] AddCommentDto request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                if (string.IsNullOrWhiteSpace(request.comment_text))
                {
                    return BadRequest(new { error = "Comment text is required" });
                }

                var task = await _taskService.GetTaskByIdAsync(id);
                if (task == null)
                {
                    return NotFound(new { error = $"Task with ID {id} not found" });
                }

                var comment = new TaskComment
                {
                    TaskId = id,
                    AuthorId = userId,
                    Content = request.comment_text,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CommentType.UserComment
                };

                var createdComment = await _taskService.AddCommentAsync(comment);
                await _notificationService.NotifyTaskCommentAsync(id, userId, request.comment_text);
                // Update task timestamp
                task.UpdatedAt = DateTime.UtcNow;
                await _taskService.UpdateTaskAsync(task, userId, userName);

                var commentDto = new CommentDto
                {
                    CommentId = createdComment.CommentId,
                    TaskId = createdComment.TaskId,
                    Content = createdComment.Content,
                    AuthorId = createdComment.AuthorId,
                    AuthorName = userName,
                    CreatedAt = createdComment.CreatedAt,
                    UpdatedAt = createdComment.UpdatedAt,
                    CommentType = createdComment.CommentType.ToString()
                };

                _logger.LogInformation("Comment added to task {TaskId} by user {UserId} ({UserName})", id, userId, userName);

                return Ok(commentDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding comment to task {TaskId}", id);
                return StatusCode(500, new { error = "An error occurred while adding comment", details = ex.Message });
            }
        }

        /// <summary>
        /// Request amendment for a task
        /// CRITICAL FIX: Returns Ok() with success=false for business logic failures instead of BadRequest()
        /// to prevent browser from logging "Failed to load resource: 400 (Bad Request)" in the console.
        /// The frontend checks the 'success' field to determine if the operation succeeded.
        /// </summary>
        [HttpPost("{id}/request-amendment")]
        public async Task<ActionResult> RequestAmendment(int id, [FromBody] RequestAmendmentDto request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                if (string.IsNullOrWhiteSpace(request.AmendmentReason))
                {
                    return Ok(new { success = false, error = "Amendment reason is required" });
                }

                var result = await _amendmentService.RequestAmendmentAsync(id, userId, request.AmendmentReason);
                
                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Amendment request failed";
                    _logger.LogWarning("Amendment request failed for task {TaskId}: {Error}", id, errorMessage);
                    return Ok(new { success = false, error = errorMessage });
                }

                _logger.LogInformation("Amendment requested for task {TaskId} by user {UserId} ({UserName})", id, userId, userName);

                return Ok(new { 
                    success = true, 
                    message = "Amendment requested successfully. Team Leaders have been notified.",
                    amendment = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error requesting amendment for task {TaskId}", id);
                return StatusCode(500, new { error = "An error occurred while requesting amendment", details = ex.Message });
            }
        }

        /// <summary>
        /// Review amendment request (Team Leader or Director)
        /// CRITICAL FIX: Returns Ok() with success=false for business logic failures instead of BadRequest()
        /// to prevent browser from logging "Failed to load resource: 400 (Bad Request)" in the console.
        /// The frontend checks the 'success' field to determine if the operation succeeded.
        /// </summary>
        [HttpPost("{id}/amendment/review")]
        public async Task<ActionResult> ReviewAmendment(int id, [FromBody] AmendmentReviewRequestDto request)
        {
            try
            {
                var (userId, userName, userRole) = GetCurrentUser();
                
                _logger.LogInformation("Amendment review request received for task {TaskId} by user {UserId} ({UserName})", id, userId, userName);
                _logger.LogInformation("Request payload: {@Request}", request);

                var reviewComments = request.amendment_comments ?? request.ReviewComments ?? "";
                
                if (string.IsNullOrWhiteSpace(reviewComments))
                {
                    _logger.LogWarning("Amendment review rejected - empty comments. Request: {@Request}", request);
                    return Ok(new { success = false, error = "Review comments are required" });
                }

                DTOAmendmentStatus dtoAmendmentStatus;
                if (request.amendment_status.HasValue)
                {
                    dtoAmendmentStatus = (DTOAmendmentStatus)request.amendment_status.Value;
                }
                else if (!string.IsNullOrEmpty(request.amendment_decision) && Enum.TryParse<DTOAmendmentStatus>(request.amendment_decision, true, out var parsedStatus))
                {
                    dtoAmendmentStatus = parsedStatus;
                }
                else
                {
                    return Ok(new { success = false, error = "Invalid amendment status or decision" });
                }

                var result = await _amendmentService.ReviewAmendmentAsync(id, userId, dtoAmendmentStatus, reviewComments);
                
                if (!result.IsSuccess)
                {
                    var errorMessage = result.Errors?.FirstOrDefault() ?? "Amendment review failed";
                    _logger.LogWarning("Amendment review failed for task {TaskId}: {Error}", id, errorMessage);
                    return Ok(new { success = false, error = errorMessage });
                }

                _logger.LogInformation("Amendment reviewed for task {TaskId} by user {UserId} ({UserName}) with status {Status}", 
                    id, userId, userName, dtoAmendmentStatus);

                return Ok(new { 
                    success = true, 
                    message = $"Amendment {dtoAmendmentStatus.ToString().ToLower()} successfully.",
                    amendment = result.Payload
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reviewing amendment for task {TaskId}", id);
                return StatusCode(500, new { error = "An error occurred while reviewing amendment", details = ex.Message });
            }
        }

        /// <summary>
        /// Create a new task - CRITICAL FIX: Now properly handles IsDuplicate and DuplicateJustification fields
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<TaskDto>> CreateTask([FromBody] CreateTaskDto request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.Description))
                {
                    return BadRequest(new { message = "Description is required" });
                }

                if (request.CategoryId <= 0)
                {
                    return BadRequest(new { message = "Valid CategoryId is required" });
                }

                // PriorityId is optional - "None" is a valid default.
                // Only validate if a priority was explicitly provided.
                if (request.PriorityId.HasValue && request.PriorityId.Value <= 0)
                {
                    return BadRequest(new { message = "PriorityId must be a positive integer or null (None)" });
                }

                // CRITICAL FIX: Properly set IsDuplicate and DuplicateJustification from request
                _logger.LogInformation("CreateTask request received with IsDuplicate={IsDuplicate}, DuplicateJustification={Justification}", 
                    request.IsDuplicate, request.DuplicateJustification);

                // NEW: If an engineer is assigned at creation time (not "Unassigned"),
                // stamp AssignedAt to record the exact moment the engineer was assigned.
                // This is used for variance/performance calculations instead of CreatedAt.
                var initialAssignedEngineer = request.AssignedEngineer ?? "Unassigned";
                DateTime? initialAssignedAt = null;
                if (!string.IsNullOrWhiteSpace(initialAssignedEngineer)
                    && !string.Equals(initialAssignedEngineer, "Unassigned", StringComparison.OrdinalIgnoreCase))
                {
                    initialAssignedAt = DateTime.UtcNow;
                }

                var newTaskEntity = new TaskEntity
                {
                    SerialNumber = request.SerialNumber,
                    PartNumber = request.PartNumber,
                    PoNumber = request.PoNumber,
                    Description = request.Description,
                    CategoryId = request.CategoryId,
                    Status = TaskStatusEnum.Pending,
                    Comments = request.Comments,
                    AssignedEngineer = initialAssignedEngineer,
                    AssignedAt = initialAssignedAt,
                    PriorityId = request.PriorityId,
                    EstimatedCompletionDate = request.EstimatedCompletionDate != default ? request.EstimatedCompletionDate : DateTime.Now.AddDays(7),
                    TargetCompletionDate = request.TargetCompletionDate,
                    AttachmentPath = request.AttachmentPath,
                    // CRITICAL FIX: If ShopId is not provided in request, get it from the creator's shop
                    ShopId = request.ShopId ?? (await _userService.GetUserByIdAsync(request.CreatedBy))?.ShopId,
                    CreatedBy = request.CreatedBy > 0 ? request.CreatedBy : 1,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    IsDuplicate = request.IsDuplicate,
                    DuplicateJustification = request.DuplicateJustification
                };

                var createdTask = await _taskService.CreateTaskAsync(newTaskEntity);
                await _notificationService.NotifyTaskCreationAsync(createdTask.TaskId, request.CreatedBy);
                
                // Create initial comment if provided
                if (!string.IsNullOrWhiteSpace(request.Comments))
                {
                    var initialComment = new TaskComment
                    {
                        TaskId = createdTask.TaskId,
                        AuthorId = request.CreatedBy,
                        Content = request.Comments,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                        CommentType = CommentType.UserComment
                    };
                    await _taskService.AddCommentAsync(initialComment);
                }
                
                var fullTask = await _taskService.GetTaskByIdAsync(createdTask.TaskId);

                // Resolve engineer phone number for the created task
                string? createdTaskEngineerPhone = null;
                if (!string.IsNullOrEmpty(fullTask!.AssignedEngineer) && fullTask.AssignedEngineer != "Unassigned")
                {
                    var engName = fullTask.AssignedEngineer.Split(',')[0].Trim();
                    var engUser = await _userService.GetUserByUsernameOrFullNameAsync(engName);
                    createdTaskEngineerPhone = engUser?.PhoneNumber;
                }

                var taskDto = new TaskDto
                {
                    TaskId = fullTask.TaskId,
                    SerialNumber = fullTask.SerialNumber ?? "",
                    PartNumber = fullTask.PartNumber ?? "",
                    PoNumber = fullTask.PoNumber ?? "",
                    Description = fullTask.Description,
                    CategoryId = fullTask.CategoryId,
                    CategoryName = fullTask.Category?.Name ?? "Unknown",
                    Status = fullTask.Status,
                    Comments = fullTask.Comments,
                    AssignedEngineer = fullTask.AssignedEngineer ?? "Unassigned",
                    PriorityId = fullTask.PriorityId,
                    PriorityName = fullTask.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = fullTask.EstimatedCompletionDate,
                    TargetCompletionDate = fullTask.TargetCompletionDate,
                    ActualCompletionDate = fullTask.ActualCompletionDate,
                    AttachmentPath = fullTask.AttachmentPath,
                    AttachmentsCount = fullTask.Attachments?.Count ?? (string.IsNullOrEmpty(fullTask.AttachmentPath) ? 0 : 1),
                    ShopId = fullTask.ShopId,
                    ShopName = fullTask.Shop?.Name ?? "Unknown",
                    PhoneExtension = fullTask.Creator?.PhoneNumber,
                    EngineerPhoneNumber = createdTaskEngineerPhone,
                    CreatedBy = fullTask.CreatedBy,
                    CreatedByName = fullTask.Creator?.FullName ?? "Unknown",
                    CreatedAt = fullTask.CreatedAt,
                    UpdatedAt = fullTask.UpdatedAt,
                    
                    // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                    StatusChangedAt = fullTask.StatusChangedAt,
                    // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                    // but an already-assigned engineer show a real timestamp instead of
                    // "Not yet assigned" on the frontend.
                    AssignedAt = ResolveAssignedAt(fullTask.AssignedEngineer, fullTask.AssignedAt, fullTask.UpdatedAt, fullTask.CreatedAt),
                    
                    // Include amendment fields
                    AmendmentRequest = fullTask.AmendmentRequest,
                    AmendmentStatus = fullTask.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(fullTask.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = fullTask.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = fullTask.AmendmentReviewer?.FullName,
                    
                    // Include reopened fields
                    IsReopened = fullTask.IsReopened,
                    ReopenCount = fullTask.ReopenCount,
                    ReopenedBy = fullTask.ReopenedBy,
                    ReopenedByName = fullTask.ReopenedByUser?.FullName,
                    ReopenedAt = fullTask.ReopenedAt,
                    ReopenReason = fullTask.ReopenReason,

                    // CRITICAL FIX: Include IsDuplicate field - Location 3/6
                    IsDuplicate = fullTask.IsDuplicate,
                    DuplicateJustification = fullTask.DuplicateJustification,

                    // Include revision fields
                    RevisionNotes = fullTask.RevisionNotes,
                    ShowRevisionAlert = fullTask.ShowRevisionAlert
                };

                _logger.LogInformation("Task {TaskId} created successfully with IsDuplicate={IsDuplicate}", 
                    taskDto.TaskId, taskDto.IsDuplicate);

                return CreatedAtAction(nameof(GetTask), new { id = taskDto.TaskId }, new { task = taskDto });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating task");
                return StatusCode(500, new { message = "An error occurred while creating the task", error = ex.Message });
            }
        }

        /// <summary>
        /// Update an existing task - CRITICAL FIX: Now automatically creates hold request when engineer changes status to OnHold
        /// Also properly handles RevisionNotes, ShowRevisionAlert, and UpdateComment
        /// ACTUAL COMPLETION DATE FIX: Now sets ActualCompletionDate when engineer marks task complete (PendingTLApproval),
        /// so the date reflects when the engineer completed the work, not when the TL approved it.
        /// </summary>
        [HttpPut("{id}")]
        public async Task<ActionResult<TaskDto>> UpdateTask(int id, [FromBody] UpdateTaskDto request)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                var existingTask = await _taskService.GetTaskByIdAsync(id);
                if (existingTask == null)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                if (string.IsNullOrEmpty(request.Description))
                {
                    return BadRequest(new { message = "Description is required" });
                }

                var previousStatus = existingTask.Status;

                // CRITICAL FIX: Check if engineer is changing status to OnHold BEFORE updating the task
                // Enhanced role check to support multiple engineer role formats
                var isEngineerRequestingHold = request.Status == TaskStatusEnum.OnHold && 
                                               previousStatus != TaskStatusEnum.OnHold && 
                                               IsEngineerRole(userRole);

                if (isEngineerRequestingHold)
                {
                    _logger.LogInformation("Engineer {UserId} ({UserName}, Role: {UserRole}) is changing task {TaskId} status to OnHold. Creating hold request BEFORE status change.", 
                        userId, userName, userRole, id);

                    // Use UpdateComment as hold reason, or default message
                    var holdReason = !string.IsNullOrWhiteSpace(request.UpdateComment) 
                        ? request.UpdateComment 
                        : "Task placed on hold by engineer";

                    try
                    {
                        // Create hold request FIRST (this will also change the status to OnHold internally)
                        var holdRequestResult = await _taskHoldService.CreateHoldRequestAsync(
                            id,
                            userId,
                            holdReason,
                            CancellationToken.None);

                        if (holdRequestResult.IsSuccess)
                        {
                            _logger.LogInformation("Hold request created successfully for task {TaskId}. Days worked: {Days}. Status automatically changed to OnHold.", 
                                id, holdRequestResult.Payload?.DaysWorkedByEngineer ?? 0);
                            
                            // Reload the task to get the updated status from hold request creation
                            existingTask = await _taskService.GetTaskByIdAsync(id);
                            if (existingTask == null)
                            {
                                return NotFound(new { message = $"Task with ID {id} not found after hold request" });
                            }
                        }
                        else
                        {
                            var errorMessage = holdRequestResult.Errors?.FirstOrDefault() ?? "Unknown error";
                            _logger.LogError("Failed to create hold request for task {TaskId}: {Error}", id, errorMessage);
                            return BadRequest(new { message = $"Failed to create hold request: {errorMessage}" });
                        }
                    }
                    catch (Exception holdEx)
                    {
                        _logger.LogError(holdEx, "Exception occurred while creating hold request for task {TaskId}", id);
                        return StatusCode(500, new { message = "Failed to create hold request", error = holdEx.Message });
                    }
                }

                // Update all task fields (but status is already OnHold if hold was requested)
                existingTask.SerialNumber = request.SerialNumber;
                existingTask.PartNumber = request.PartNumber;
                existingTask.PoNumber = request.PoNumber;
                existingTask.Description = request.Description;
                existingTask.CategoryId = request.CategoryId;
                
                // Only update status if it wasn't already changed by hold request
                if (!isEngineerRequestingHold)
                {
                    existingTask.Status = request.Status;
                }
                
                existingTask.Comments = request.Comments;

                // NEW: Track engineer assignment change and auto-stamp AssignedAt on the first
                // real assignment (i.e., transitioning from "Unassigned" to an actual engineer).
                // Once set, AssignedAt is preserved across subsequent re-assignments so that
                // variance / performance metrics remain anchored to the ORIGINAL assignment time.
                var previousAssignedEngineer = existingTask.AssignedEngineer ?? "Unassigned";
                var newAssignedEngineer = request.AssignedEngineer ?? "Unassigned";
                existingTask.AssignedEngineer = newAssignedEngineer;

                var wasUnassigned = string.IsNullOrWhiteSpace(previousAssignedEngineer)
                    || string.Equals(previousAssignedEngineer, "Unassigned", StringComparison.OrdinalIgnoreCase);
                var isNowAssigned = !string.IsNullOrWhiteSpace(newAssignedEngineer)
                    && !string.Equals(newAssignedEngineer, "Unassigned", StringComparison.OrdinalIgnoreCase);

                if (wasUnassigned && isNowAssigned && existingTask.AssignedAt == null)
                {
                    existingTask.AssignedAt = DateTime.UtcNow;
                    _logger.LogInformation(
                        "Task {TaskId}: AssignedAt stamped to {AssignedAt} on first assignment to '{Engineer}'",
                        id, existingTask.AssignedAt, newAssignedEngineer);
                }
                // BUG FIX: Backfill AssignedAt for tasks that are ALREADY assigned but have a
                // null AssignedAt (legacy data or tasks created before this field was tracked).
                // Without this, the frontend keeps showing "Not yet assigned" for already-assigned
                // tasks even though an engineer has been assigned by the Team Leader.
                else if (isNowAssigned && existingTask.AssignedAt == null)
                {
                    existingTask.AssignedAt = DateTime.UtcNow;
                    _logger.LogInformation(
                        "Task {TaskId}: AssignedAt backfilled to {AssignedAt} for already-assigned engineer '{Engineer}' (legacy null value)",
                        id, existingTask.AssignedAt, newAssignedEngineer);
                }

                existingTask.PriorityId = request.PriorityId;
                
                // CRITICAL FIX: Properly handle nullable EstimatedCompletionDate
                if (request.EstimatedCompletionDate.HasValue && request.EstimatedCompletionDate.Value != default)
                {
                    existingTask.EstimatedCompletionDate = request.EstimatedCompletionDate.Value;
                }
                
                // ═══════════════════════════════════════════════════════════════════════
                // TARGET COMPLETION DATE — ALWAYS STORE THE LATEST AUTHORIZED UPDATE (UTC)
                // ═══════════════════════════════════════════════════════════════════════
                // Rule 1: Only Team Leaders / Directors may change TargetCompletionDate.
                //         For every other role the stored value is kept untouched.
                // Rule 2: A null/missing TargetCompletionDate in the payload must NOT
                //         clear or reset an already-stored target.
                // Rule 3 (BUG FIX): when an authorized editor submits a value it is ALWAYS
                //         persisted as the newest value, converted to UTC exactly once.
                //         The previous implementation contained a "forward-only guard" that
                //         silently restored the OLD target whenever the new one was not far
                //         enough in the future. The save returned success, but the database
                //         still held the older auto-calculated timestamp — which is exactly
                //         why a target updated to 10:55:56 AM was later displayed as
                //         6:08:59 AM. Nothing is reverted behind the user's back anymore:
                //         the most recent update is the value that is stored and displayed.
                var previousTargetCompletionDate = NormalizeToUtc(existingTask.TargetCompletionDate);

                if (CanEditTargetCompletionDate(userRole))
                {
                    var requestedTarget = NormalizeToUtc(request.TargetCompletionDate);

                    if (requestedTarget.HasValue)
                    {
                        // Persist the FULL timestamp (date + time + seconds) as a true UTC
                        // instant, so the value read back describes the same moment the
                        // Team Leader selected — no drift, no rounding, no reset.
                        existingTask.TargetCompletionDate = requestedTarget.Value;

                        _logger.LogInformation(
                            "Task {TaskId}: TargetCompletionDate updated from {OldTarget:o} to {NewTarget:o} by {UserRole} {UserId} ({UserName})",
                            id, previousTargetCompletionDate, existingTask.TargetCompletionDate, userRole, userId, userName);
                    }
                    else
                    {
                        // Omitted/null value from an authorized editor: keep the stored
                        // target instead of clearing it, so metrics stay intact.
                        existingTask.TargetCompletionDate = previousTargetCompletionDate;

                        _logger.LogInformation(
                            "Task {TaskId}: TargetCompletionDate omitted in update by {UserRole} {UserId}; preserving stored value {StoredTarget:o}",
                            id, userRole, userId, previousTargetCompletionDate);
                    }
                }
                else
                {
                    // Unauthorized role: keep exactly what is already stored (normalized to
                    // UTC so it can never be re-saved with an ambiguous DateTimeKind).
                    existingTask.TargetCompletionDate = previousTargetCompletionDate;

                    var attemptedTarget = NormalizeToUtc(request.TargetCompletionDate);
                    if (attemptedTarget.HasValue && attemptedTarget != previousTargetCompletionDate)
                    {
                        _logger.LogWarning(
                            "Task {TaskId}: user {UserId} ({UserName}, Role: {UserRole}) attempted to change TargetCompletionDate from {OldTarget:o} to {NewTarget:o}. Change IGNORED — only Team Leaders/Directors may edit it.",
                            id, userId, userName, userRole, previousTargetCompletionDate, attemptedTarget);
                    }
                }

                // Only overwrite ActualCompletionDate when a value is actually supplied,
                // so a partial update cannot erase the engineer's real completion date.
                if (request.ActualCompletionDate.HasValue && request.ActualCompletionDate.Value != default)
                {
                    existingTask.ActualCompletionDate = request.ActualCompletionDate.Value;
                }

                if (!string.IsNullOrEmpty(request.AttachmentPath))
                {
                    existingTask.AttachmentPath = request.AttachmentPath;
                }
                
                existingTask.ShopId = request.ShopId;
                
                // Explicitly update RevisionNotes and ShowRevisionAlert
                if (!string.IsNullOrWhiteSpace(request.RevisionNotes))
                {
                    existingTask.RevisionNotes = request.RevisionNotes;
                    _logger.LogInformation("Updated revision notes for task {TaskId}: {RevisionNotes}", id, request.RevisionNotes);
                }
                
                // FIXED: Check if ShowRevisionAlert has a value before accessing .Value
                if (request.ShowRevisionAlert.HasValue)
                {
                    existingTask.ShowRevisionAlert = request.ShowRevisionAlert.Value == 1;
                    _logger.LogInformation("Updated show revision alert for task {TaskId}: {ShowAlert}", id, existingTask.ShowRevisionAlert);
                }
                
                existingTask.UpdatedAt = DateTime.UtcNow;

                // Handle UpdateComment - create a new comment entry if provided
                if (!string.IsNullOrWhiteSpace(request.UpdateComment))
                {
                    var updateComment = new TaskComment
                    {
                        TaskId = id,
                        AuthorId = userId,
                        Content = request.UpdateComment,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                        CommentType = CommentType.UserComment
                    };
                    
                    await _taskService.AddCommentAsync(updateComment);
                    
                    _logger.LogInformation("Update comment added to task {TaskId} by user {UserId} ({UserName}): {Comment}", 
                        id, userId, userName, request.UpdateComment);
                }

                // Handle task completion - ROLE-BASED: Engineers get PendingTLApproval, TL/Admin/Director complete directly
                if (request.Status == TaskStatusEnum.Completed && previousStatus != TaskStatusEnum.Completed && previousStatus != TaskStatusEnum.PendingTLApproval)
                {
                    // Check if the user is an engineer - if so, set to PendingTLApproval instead of Completed
                    if (IsEngineerRole(userRole))
                    {
                        _logger.LogInformation("Engineer {UserId} ({UserName}) marking task {TaskId} as completed - setting to PendingTLApproval instead", userId, userName, id);
                        
                        existingTask.Status = TaskStatusEnum.PendingTLApproval;
                        existingTask.UpdatedAt = DateTime.UtcNow;
                        
                        // ═══════════════════════════════════════════════════════════════════════
                        // CRITICAL FIX: Set ActualCompletionDate NOW when the engineer marks the
                        // task as complete. This captures the actual time the engineer finished
                        // the work, NOT when the Team Leader later approves it.
                        // ═══════════════════════════════════════════════════════════════════════
                        existingTask.ActualCompletionDate = DateTime.UtcNow;
                        _logger.LogInformation("ActualCompletionDate set to {ActualCompletionDate} for task {TaskId} at engineer completion time (PendingTLApproval)", 
                            existingTask.ActualCompletionDate, id);
                        
                        await _taskService.UpdateTaskAsync(existingTask, userId, userName);
                        
                        // Notify Team Leaders that a task is pending their approval
                        await _notificationService.NotifyTaskStatusChangeAsync(id, "PendingTLApproval", userName);
                        
                        var fullTaskPending = await _taskService.GetTaskByIdAsync(id);
                        
                        var pendingDto = new TaskDto
                        {
                            TaskId = fullTaskPending!.TaskId,
                            SerialNumber = fullTaskPending.SerialNumber ?? "",
                            PartNumber = fullTaskPending.PartNumber ?? "",
                            PoNumber = fullTaskPending.PoNumber ?? "",
                            Description = fullTaskPending.Description,
                            CategoryId = fullTaskPending.CategoryId,
                            CategoryName = fullTaskPending.Category?.Name ?? "Unknown",
                            Status = fullTaskPending.Status,
                            Comments = fullTaskPending.Comments,
                            AssignedEngineer = fullTaskPending.AssignedEngineer ?? "Unassigned",
                            PriorityId = fullTaskPending.PriorityId,
                            PriorityName = fullTaskPending.Priority?.LevelName ?? "Unknown",
                            EstimatedCompletionDate = fullTaskPending.EstimatedCompletionDate,
                            TargetCompletionDate = fullTaskPending.TargetCompletionDate,
                            ActualCompletionDate = fullTaskPending.ActualCompletionDate,
                            AttachmentPath = fullTaskPending.AttachmentPath,
                            AttachmentsCount = fullTaskPending.Attachments?.Count ?? (string.IsNullOrEmpty(fullTaskPending.AttachmentPath) ? 0 : 1),
                            ShopId = fullTaskPending.ShopId,
                            ShopName = fullTaskPending.Shop?.Name ?? "Unknown",
                            PhoneExtension = fullTaskPending.Creator?.PhoneNumber,
                            CreatedBy = fullTaskPending.CreatedBy,
                            CreatedByName = fullTaskPending.Creator?.FullName ?? "Unknown",
                            CreatedAt = fullTaskPending.CreatedAt,
                            UpdatedAt = fullTaskPending.UpdatedAt,
                            // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                            StatusChangedAt = fullTaskPending.StatusChangedAt,
                            // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                            // but an already-assigned engineer show a real timestamp instead of
                            // "Not yet assigned" on the frontend.
                            AssignedAt = ResolveAssignedAt(fullTaskPending.AssignedEngineer, fullTaskPending.AssignedAt, fullTaskPending.UpdatedAt, fullTaskPending.CreatedAt),
                            AmendmentRequest = fullTaskPending.AmendmentRequest,
                            AmendmentStatus = fullTaskPending.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(fullTaskPending.AmendmentStatus.Value) : null,
                            AmendmentReviewedByTlId = fullTaskPending.AmendmentReviewedByTlId,
                            AmendmentReviewedByName = fullTaskPending.AmendmentReviewer?.FullName,
                            IsReopened = fullTaskPending.IsReopened,
                            ReopenCount = fullTaskPending.ReopenCount,
                            ReopenedBy = fullTaskPending.ReopenedBy,
                            ReopenedByName = fullTaskPending.ReopenedByUser?.FullName,
                            ReopenedAt = fullTaskPending.ReopenedAt,
                            ReopenReason = fullTaskPending.ReopenReason,
                            IsDuplicate = fullTaskPending.IsDuplicate,
                            DuplicateJustification = fullTaskPending.DuplicateJustification,
                            RevisionNotes = fullTaskPending.RevisionNotes,
                            ShowRevisionAlert = fullTaskPending.ShowRevisionAlert
                        };

                        return Ok(new { 
                            message = "Task marked as completed - pending Team Leader approval",
                            movedToCompleted = false,
                            pendingTLApproval = true,
                            task = pendingDto
                        });
                    }

                    // Non-engineer roles (TL, Admin, Director) can complete directly
                    if (!existingTask.ActualCompletionDate.HasValue)
                    {
                        // CRITICAL FIX: Use DateTime.UtcNow (not .Date) to preserve the full timestamp including hours/minutes/seconds
                        existingTask.ActualCompletionDate = DateTime.UtcNow;
                    }

                    await _taskService.UpdateTaskAsync(existingTask, userId, userName);

                    _logger.LogInformation("Moving task {TaskId} to completed_tasks table", id);
                    var completedTask = await _completedTaskService.MoveTaskToCompletedAsync(existingTask);
                    await _notificationService.NotifyTaskCompletionAsync(id, userId);
                    var completedDto = new CompletedTaskDto
                    {
                        CompletedTaskId = completedTask.CompletedTaskId,
                        OriginalTaskId = completedTask.OriginalTaskId,
                        SerialNumber = completedTask.SerialNumber ?? "",
                        PartNumber = completedTask.PartNumber ?? "",
                        PoNumber = completedTask.PoNumber ?? "",
                        Description = completedTask.Description,
                        CategoryId = completedTask.CategoryId,
                        CategoryName = completedTask.Category?.Name ?? "Unknown",
                        Status = completedTask.Status,
                        Comments = completedTask.Comments,
                        AssignedEngineer = completedTask.AssignedEngineer ?? "Unassigned",
                        PriorityId = completedTask.PriorityId,
                        PriorityName = completedTask.Priority?.LevelName ?? "Unknown",
                        EstimatedCompletionDate = completedTask.EstimatedCompletionDate,
                        TargetCompletionDate = completedTask.TargetCompletionDate,
                        ActualCompletionDate = completedTask.ActualCompletionDate,
                        AttachmentPath = completedTask.AttachmentPath,
                        AttachmentsCount = completedTask.Attachments?.Count ?? (string.IsNullOrEmpty(completedTask.AttachmentPath) ? 0 : 1),
                        ShopId = completedTask.ShopId ?? completedTask.Creator?.ShopId,
                        ShopName = completedTask.Shop?.Name ?? completedTask.Creator?.Shop?.Name ?? "Unknown",
                        CreatedBy = completedTask.CreatedBy,
                        CreatedByName = completedTask.Creator?.FullName ?? "Unknown",
                        TaskCreatedAt = completedTask.TaskCreatedAt,
                        TaskUpdatedAt = completedTask.TaskUpdatedAt,
                        CompletedAt = completedTask.CompletedAt,
                        MovedToCompletedAt = completedTask.MovedToCompletedAt,
                        // BUG FIX: Expose TaskAssignedAt with legacy fallback so already-assigned
                        // completed tasks show a real timestamp instead of "Not yet assigned".
                        TaskAssignedAt = ResolveAssignedAt(completedTask.AssignedEngineer, completedTask.TaskAssignedAt, completedTask.TaskUpdatedAt, completedTask.TaskCreatedAt),
                        IsDuplicate = completedTask.IsDuplicate,
                        DuplicateJustification = completedTask.DuplicateJustification,
                        RevisionNotes = completedTask.RevisionNotes,
                        ShowRevisionAlert = completedTask.ShowRevisionAlert
                    };

                    return Ok(new { 
                        message = "Task completed and moved to completed tasks table",
                        movedToCompleted = true,
                        completedTask = completedDto 
                    });
                }

                var updatedTask = await _taskService.UpdateTaskAsync(existingTask, userId, userName);
                var fullTask = await _taskService.GetTaskByIdAsync(updatedTask.TaskId);

                // Resolve engineer phone number for the updated task
                string? updatedTaskEngineerPhone = null;
                if (!string.IsNullOrEmpty(fullTask!.AssignedEngineer) && fullTask.AssignedEngineer != "Unassigned")
                {
                    var engName = fullTask.AssignedEngineer.Split(',')[0].Trim();
                    var engUser = await _userService.GetUserByUsernameOrFullNameAsync(engName);
                    updatedTaskEngineerPhone = engUser?.PhoneNumber;
                }

                var taskDto = new TaskDto
                {
                    TaskId = fullTask.TaskId,
                    SerialNumber = fullTask.SerialNumber ?? "",
                    PartNumber = fullTask.PartNumber ?? "",
                    PoNumber = fullTask.PoNumber ?? "",
                    Description = fullTask.Description,
                    CategoryId = fullTask.CategoryId,
                    CategoryName = fullTask.Category?.Name ?? "Unknown",
                    Status = fullTask.Status,
                    Comments = fullTask.Comments,
                    AssignedEngineer = fullTask.AssignedEngineer ?? "Unassigned",
                    PriorityId = fullTask.PriorityId,
                    PriorityName = fullTask.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = fullTask.EstimatedCompletionDate,
                    TargetCompletionDate = fullTask.TargetCompletionDate,
                    ActualCompletionDate = fullTask.ActualCompletionDate,
                    AttachmentPath = fullTask.AttachmentPath,
                    AttachmentsCount = fullTask.Attachments?.Count ?? (string.IsNullOrEmpty(fullTask.AttachmentPath) ? 0 : 1),
                    ShopId = fullTask.ShopId,
                    ShopName = fullTask.Shop?.Name ?? "Unknown",
                    PhoneExtension = fullTask.Creator?.PhoneNumber,
                    EngineerPhoneNumber = updatedTaskEngineerPhone,
                    CreatedBy = fullTask.CreatedBy,
                    CreatedByName = fullTask.Creator?.FullName ?? "Unknown",
                    CreatedAt = fullTask.CreatedAt,
                    UpdatedAt = fullTask.UpdatedAt,
                    
                    // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                    StatusChangedAt = fullTask.StatusChangedAt,
                    // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                    // but an already-assigned engineer show a real timestamp instead of
                    // "Not yet assigned" on the frontend.
                    AssignedAt = ResolveAssignedAt(fullTask.AssignedEngineer, fullTask.AssignedAt, fullTask.UpdatedAt, fullTask.CreatedAt),
                    
                    // Include amendment fields
                    AmendmentRequest = fullTask.AmendmentRequest,
                    AmendmentStatus = fullTask.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(fullTask.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = fullTask.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = fullTask.AmendmentReviewer?.FullName,
                    
                    // Include reopened fields
                    IsReopened = fullTask.IsReopened,
                    ReopenCount = fullTask.ReopenCount,
                    ReopenedBy = fullTask.ReopenedBy,
                    ReopenedByName = fullTask.ReopenedByUser?.FullName,
                    ReopenedAt = fullTask.ReopenedAt,
                    ReopenReason = fullTask.ReopenReason,

                    // FIXED: Include IsDuplicate field - Location 4/6
                    IsDuplicate = fullTask.IsDuplicate,
                    DuplicateJustification = fullTask.DuplicateJustification,

                    // Include revision fields in updated task response
                    RevisionNotes = fullTask.RevisionNotes,
                    ShowRevisionAlert = fullTask.ShowRevisionAlert
                };

                _logger.LogInformation("Task {TaskId} updated successfully by user {UserId} ({UserName}). Status: {Status}", 
                    id, userId, userName, fullTask.Status);

                return Ok(taskDto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while updating the task", error = ex.Message });
            }
        }

        /// <summary>
        /// Delete a task
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteTask(int id)
        {
            try
            {
                var success = await _taskService.DeleteTaskAsync(id);
                if (!success)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                return Ok(new { message = $"Task {id} has been deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while deleting the task", error = ex.Message });
            }
        }

        /// <summary>
        /// Update task status - automatically moves to completed_tasks table when marked as Completed
        /// Engineers get PendingTLApproval; TL/Admin/Director can complete directly
        /// CRITICAL FIX: Now uses GetCurrentUserAsync() to resolve role from DB when JWT claim is missing
        /// ACTUAL COMPLETION DATE FIX: Now sets ActualCompletionDate when engineer marks task complete (PendingTLApproval),
        /// so the date reflects when the engineer completed the work, not when the TL approved it.
        /// </summary>
        [HttpPatch("{id}/status")]
        public async Task<ActionResult> UpdateTaskStatus(int id, [FromBody] UpdateTaskStatusRequest request)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                var existingTask = await _taskService.GetTaskByIdAsync(id);
                if (existingTask == null)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                var previousStatus = existingTask.Status;

                existingTask.UpdatedAt = DateTime.UtcNow;

                if (request.Status == TaskStatusEnum.Completed && previousStatus != TaskStatusEnum.Completed && previousStatus != TaskStatusEnum.PendingTLApproval)
                {
                    // Engineers get PendingTLApproval instead of direct completion
                    if (IsEngineerRole(userRole))
                    {
                        _logger.LogInformation("Engineer {UserId} ({UserName}) marking task {TaskId} as completed via PATCH - setting to PendingTLApproval", userId, userName, id);
                        
                        existingTask.Status = TaskStatusEnum.PendingTLApproval;
                        
                        // ═══════════════════════════════════════════════════════════════════════
                        // CRITICAL FIX: Set ActualCompletionDate NOW when the engineer marks the
                        // task as complete via PATCH. This captures the actual time the engineer
                        // finished the work, NOT when the Team Leader later approves it.
                        // ═══════════════════════════════════════════════════════════════════════
                        existingTask.ActualCompletionDate = DateTime.UtcNow;
                        _logger.LogInformation("ActualCompletionDate set to {ActualCompletionDate} for task {TaskId} at engineer completion time via PATCH (PendingTLApproval)", 
                            existingTask.ActualCompletionDate, id);
                        
                        await _taskService.UpdateTaskAsync(existingTask, userId, userName);
                        
                        // Notify Team Leaders
                        await _notificationService.NotifyTaskStatusChangeAsync(id, "PendingTLApproval", userName);
                        
                        return Ok(new { 
                            message = "Task marked as completed - pending Team Leader approval",
                            movedToCompleted = false,
                            pendingTLApproval = true
                        });
                    }

                    // Non-engineer roles complete directly
                    existingTask.Status = request.Status;
                    if (!existingTask.ActualCompletionDate.HasValue)
                    {
                        // CRITICAL FIX: Use DateTime.UtcNow (not .Date) to preserve the full timestamp including hours/minutes/seconds
                        existingTask.ActualCompletionDate = DateTime.UtcNow;
                    }

                    await _taskService.UpdateTaskAsync(existingTask, userId, userName);

                    _logger.LogInformation("Moving task {TaskId} to completed_tasks table", id);
                    var completedTask = await _completedTaskService.MoveTaskToCompletedAsync(existingTask);
                    await _notificationService.NotifyTaskCompletionAsync(id, userId);
                    return Ok(new { 
                        message = "Task completed and moved to completed tasks table",
                        movedToCompleted = true,
                        completedTaskId = completedTask.CompletedTaskId,
                        originalTaskId = completedTask.OriginalTaskId
                    });
                }

                existingTask.Status = request.Status;
                await _taskService.UpdateTaskAsync(existingTask, userId, userName);

                return Ok(new { 
                    message = "Task status updated successfully",
                    movedToCompleted = false
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating task status for task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while updating task status", error = ex.Message });
            }
        }

        /// <summary>
        /// Approve a task completion that is in PendingTLApproval status.
        /// Only Team Leaders, Admins, and Directors can approve.
        /// After approval, the task is moved to the completed_tasks table.
        /// CRITICAL FIX: 
        ///   1. Uses GetCurrentUserAsync() to resolve role from DB when JWT claim is missing
        ///   2. Uses IsApprovalRole() for robust role matching
        ///   3. Uses ForbidWithMessage() instead of Forbid("message") to avoid auth scheme lookup crash
        /// ACTUAL COMPLETION DATE FIX: Now PRESERVES the existing ActualCompletionDate (set when the
        /// engineer marked the task complete) instead of overwriting it with the TL approval time.
        /// </summary>
        [HttpPost("{id}/approve-completion")]
        public async Task<ActionResult> ApproveCompletion(int id, [FromBody] ApproveRejectCompletionDto? request = null)
        {
            try
            {
                // CRITICAL FIX: Use async version to resolve role from database when JWT claim is missing
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                
                _logger.LogInformation("ApproveCompletion called for task {TaskId} by user {UserId} ({UserName}) with resolved role '{UserRole}'", 
                    id, userId, userName, userRole);
                
                // CRITICAL FIX: Use IsApprovalRole() for robust role matching instead of brittle Contains check
                if (!IsApprovalRole(userRole))
                {
                    _logger.LogWarning("User {UserId} ({UserRole}) attempted to approve completion for task {TaskId} but lacks permission", userId, userRole, id);
                    // CRITICAL FIX: Use ForbidWithMessage() instead of Forbid("message") to avoid auth scheme crash
                    return ForbidWithMessage("Only Team Leaders, Admins, and Directors can approve task completions.");
                }

                var existingTask = await _taskService.GetTaskByIdAsync(id);
                if (existingTask == null)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                if (existingTask.Status != TaskStatusEnum.PendingTLApproval)
                {
                    return BadRequest(new { message = $"Task {id} is not in PendingTLApproval status. Current status: {existingTask.Status}" });
                }

                _logger.LogInformation("Team Leader {UserId} ({UserName}) approving completion for task {TaskId}", userId, userName, id);

                // Set status to Completed
                existingTask.Status = TaskStatusEnum.Completed;
                existingTask.UpdatedAt = DateTime.UtcNow;
                
                // ═══════════════════════════════════════════════════════════════════════
                // CRITICAL FIX: PRESERVE the existing ActualCompletionDate that was set
                // when the engineer marked the task as complete. Only set it now as a
                // fallback if it was somehow not set during the PendingTLApproval step.
                // This ensures the "Actual Completion" date in the Timeline reflects
                // when the engineer completed the work, NOT when the TL approved it.
                // ═══════════════════════════════════════════════════════════════════════
                if (!existingTask.ActualCompletionDate.HasValue)
                {
                    _logger.LogWarning("ActualCompletionDate was not set during PendingTLApproval for task {TaskId}. Setting it now as fallback.", id);
                    existingTask.ActualCompletionDate = DateTime.UtcNow;
                }
                else
                {
                    _logger.LogInformation("Preserving existing ActualCompletionDate {ActualCompletionDate} for task {TaskId} (set at engineer completion time)", 
                        existingTask.ActualCompletionDate, id);
                }

                await _taskService.UpdateTaskAsync(existingTask, userId, userName);

                // Add approval comment if provided
                if (!string.IsNullOrWhiteSpace(request?.Comment))
                {
                    var approvalComment = new TaskComment
                    {
                        TaskId = id,
                        AuthorId = userId,
                        Content = $"[COMPLETION APPROVED by {userName} ({userRole})]\n{request.Comment}",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                        CommentType = CommentType.UserComment
                    };
                    await _taskService.AddCommentAsync(approvalComment);
                }
                else
                {
                    // Add a system comment noting the approval
                    var approvalComment = new TaskComment
                    {
                        TaskId = id,
                        AuthorId = userId,
                        Content = $"[COMPLETION APPROVED by {userName} ({userRole})]",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                        CommentType = CommentType.UserComment
                    };
                    await _taskService.AddCommentAsync(approvalComment);
                }

                // Move task to completed_tasks table
                _logger.LogInformation("Moving approved task {TaskId} to completed_tasks table", id);
                var completedTask = await _completedTaskService.MoveTaskToCompletedAsync(existingTask);
                
                // Send notifications
                await _notificationService.NotifyTaskCompletionAsync(id, userId);

                _logger.LogInformation("Task {TaskId} completion approved by TL {UserId} ({UserName}) and moved to completed_tasks. ActualCompletionDate preserved as {ActualCompletionDate}", 
                    id, userId, userName, existingTask.ActualCompletionDate);

                return Ok(new { 
                    success = true,
                    message = "Task completion approved and moved to completed tasks table",
                    movedToCompleted = true,
                    completedTaskId = completedTask.CompletedTaskId,
                    originalTaskId = completedTask.OriginalTaskId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving completion for task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while approving task completion", error = ex.Message });
            }
        }

        /// <summary>
        /// Reject a task completion that is in PendingTLApproval status.
        /// Only Team Leaders, Admins, and Directors can reject.
        /// After rejection, the task is sent back to InProgress status with a comment.
        /// CRITICAL FIX: 
        ///   1. Uses GetCurrentUserAsync() to resolve role from DB when JWT claim is missing
        ///   2. Uses IsApprovalRole() for robust role matching
        ///   3. Uses ForbidWithMessage() instead of Forbid("message") to avoid auth scheme lookup crash
        /// ACTUAL COMPLETION DATE FIX: Clears ActualCompletionDate when task is rejected back to InProgress,
        /// since the task is no longer considered complete.
        /// </summary>
        [HttpPost("{id}/reject-completion")]
        public async Task<ActionResult> RejectCompletion(int id, [FromBody] ApproveRejectCompletionDto request)
        {
            try
            {
                // CRITICAL FIX: Use async version to resolve role from database when JWT claim is missing
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                
                _logger.LogInformation("RejectCompletion called for task {TaskId} by user {UserId} ({UserName}) with resolved role '{UserRole}'", 
                    id, userId, userName, userRole);
                
                // CRITICAL FIX: Use IsApprovalRole() for robust role matching instead of brittle Contains check
                if (!IsApprovalRole(userRole))
                {
                    _logger.LogWarning("User {UserId} ({UserRole}) attempted to reject completion for task {TaskId} but lacks permission", userId, userRole, id);
                    // CRITICAL FIX: Use ForbidWithMessage() instead of Forbid("message") to avoid auth scheme crash
                    return ForbidWithMessage("Only Team Leaders, Admins, and Directors can reject task completions.");
                }

                if (string.IsNullOrWhiteSpace(request?.Comment))
                {
                    return BadRequest(new { message = "A comment explaining the rejection reason is required." });
                }

                var existingTask = await _taskService.GetTaskByIdAsync(id);
                if (existingTask == null)
                {
                    return NotFound(new { message = $"Task with ID {id} not found" });
                }

                if (existingTask.Status != TaskStatusEnum.PendingTLApproval)
                {
                    return BadRequest(new { message = $"Task {id} is not in PendingTLApproval status. Current status: {existingTask.Status}" });
                }

                _logger.LogInformation("Team Leader {UserId} ({UserName}) rejecting completion for task {TaskId}. Reason: {Reason}", userId, userName, id, request.Comment);

                // Set status back to InProgress
                existingTask.Status = TaskStatusEnum.InProgress;
                existingTask.UpdatedAt = DateTime.UtcNow;
                
                // ═══════════════════════════════════════════════════════════════════════
                // CRITICAL FIX: Clear ActualCompletionDate when the completion is rejected.
                // The task is being sent back to InProgress, so it is no longer complete.
                // When the engineer re-completes the task, a new ActualCompletionDate will
                // be set at that time.
                // ═══════════════════════════════════════════════════════════════════════
                _logger.LogInformation("Clearing ActualCompletionDate for task {TaskId} due to completion rejection. Previous value: {PreviousDate}", 
                    id, existingTask.ActualCompletionDate);
                existingTask.ActualCompletionDate = null;

                await _taskService.UpdateTaskAsync(existingTask, userId, userName);

                // Add rejection comment
                var rejectionComment = new TaskComment
                {
                    TaskId = id,
                    AuthorId = userId,
                    Content = $"[COMPLETION REJECTED by {userName} ({userRole})]\nReason: {request.Comment}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    CommentType = CommentType.UserComment
                };
                await _taskService.AddCommentAsync(rejectionComment);

                // Notify the assigned engineer(s) and task creator about the rejection
                await _notificationService.NotifyTaskStatusChangeAsync(id, "InProgress", userName);

                _logger.LogInformation("Task {TaskId} completion rejected by TL {UserId} ({UserName}), status set back to InProgress, ActualCompletionDate cleared", id, userId, userName);

                return Ok(new { 
                    success = true,
                    message = "Task completion rejected. Task has been sent back to In Progress status.",
                    taskId = id,
                    newStatus = "InProgress"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rejecting completion for task {TaskId}", id);
                return StatusCode(500, new { message = "An error occurred while rejecting task completion", error = ex.Message });
            }
        }

        /// <summary>
        /// CRITICAL FIX: Reopen a completed task using EnhancedAmendmentService.ReopenTaskWithAuditAsync
        /// This ensures proper TaskStatusHistory entries are created with reopen tracking data
        /// </summary>
        [HttpPost("{id}/reopen")]
        public async Task<ActionResult> ReopenTask(int id, [FromBody] ReopenTaskRequest request)
        {
            try
            {
                var (userId, userName, userRole) = await GetCurrentUserAsync();
                
                _logger.LogInformation("ReopenTask called for task {TaskId} by user {UserId} ({UserName}, {UserRole})", 
                    id, userId, userName, userRole);
                
                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.ReopenComment))
                {
                    return BadRequest(new { error = "A comment is mandatory when reopening a task." });
                }

                if (request.AssignedEngineer == null || request.AssignedEngineer.Count == 0)
                {
                    return BadRequest(new { error = "You must assign at least one engineer when reopening a task." });
                }

                // First, try to find the task in the completed_tasks table
                var completedTask = await _completedTaskService.GetCompletedTaskByOriginalIdAsync(id);
                if (completedTask == null)
                {
                    // If not in completed_tasks, check if it's still in the tasks table
                    var activeTask = await _taskService.GetTaskByIdAsync(id);
                    if (activeTask == null)
                    {
                        return NotFound(new { error = $"Task with ID {id} not found in either active or completed tasks" });
                    }
                    
                    // CRITICAL FIX: Task is already active, use EnhancedAmendmentService to update with proper audit trail
                    _logger.LogInformation("Task {TaskId} is already active, using EnhancedAmendmentService for reopen tracking", id);
                    
                    var result = await _enhancedAmendmentService.ReopenTaskWithAuditAsync(
                        id, 
                        userId, 
                        request.ReopenComment, 
                        request.AssignedEngineer, 
                        request.Status);
                    
                    if (!result.IsSuccess)
                    {
                        var errorMessage = result.Errors?.FirstOrDefault() ?? "Failed to reopen task";
                        return BadRequest(new { error = errorMessage });
                    }
                    
                    // Reload task to get updated data
                    activeTask = await _taskService.GetTaskByIdAsync(id);
                    
                    _logger.LogInformation("Task {TaskId} reopened successfully (was already active). ReopenCount: {ReopenCount}", 
                        id, activeTask!.ReopenCount);
                    
                    return Ok(new { 
                        message = "Task status updated successfully (task was already active)",
                        taskId = activeTask.TaskId,
                        reopenCount = activeTask.ReopenCount
                    });
                }

                // CRITICAL FIX: Task is in completed_tasks — update the ORIGINAL task in-place
                // instead of creating a new task, so only ONE entry exists in the active tasks table.
                var currentReopenCount = completedTask.ReopenCount;
                
                _logger.LogInformation("Reopening completed task {CompletedTaskId} (Original: {OriginalTaskId}). Current ReopenCount: {ReopenCount}", 
                    completedTask.CompletedTaskId, id, currentReopenCount);

                // Step 1: Retrieve the original task from the tasks table (it still exists with Status=Completed
                // because MoveTaskToCompletedAsync sets the original task's status to Completed but does not delete it).
                var originalTask = await _taskService.GetTaskByIdAsync(id);
                
                if (originalTask != null)
                {
                    // Step 2: Update the original task IN-PLACE with reopened data
                    _logger.LogInformation("Updating original task {TaskId} in-place for reopen (no new task will be created)", id);
                    
                    originalTask.SerialNumber = completedTask.SerialNumber;
                    originalTask.PartNumber = completedTask.PartNumber;
                    originalTask.PoNumber = completedTask.PoNumber;
                    originalTask.Description = completedTask.Description;
                    originalTask.CategoryId = completedTask.CategoryId;
                    originalTask.SubTypeId = completedTask.SubTypeId;
                    originalTask.RequestTypeId = completedTask.RequestTypeId;
                    originalTask.Status = Enum.TryParse<TaskStatusEnum>(request.Status, out var status) ? status : TaskStatusEnum.Pending;
                    originalTask.Comments = $"{completedTask.Comments}\n\n[REOPENED by {userName}]: {request.ReopenComment}";
                    originalTask.AssignedEngineer = string.Join(", ", request.AssignedEngineer);
                    originalTask.PriorityId = completedTask.PriorityId;
                    originalTask.EstimatedCompletionDate = completedTask.EstimatedCompletionDate;
                    originalTask.TargetCompletionDate = completedTask.TargetCompletionDate;
                    originalTask.ActualCompletionDate = null; // Clear the completion date since we're reopening
                    originalTask.AttachmentPath = completedTask.AttachmentPath;
                    originalTask.AmendmentRequest = completedTask.AmendmentRequest;
                    originalTask.AmendmentStatus = completedTask.AmendmentStatus;
                    originalTask.AmendmentReviewedByTlId = completedTask.AmendmentReviewedByTlId;
                    originalTask.IsDuplicate = completedTask.IsDuplicate;
                    originalTask.DuplicateJustification = completedTask.DuplicateJustification;
                    originalTask.RevisionNotes = $"[REOPENED from completed task {completedTask.CompletedTaskId}] {completedTask.RevisionNotes}";
                    originalTask.ShowRevisionAlert = true;
                    originalTask.ShopId = completedTask.ShopId;
                    originalTask.IsMandatory = completedTask.IsMandatory;
                    
                    // Initial reopen tracking fields (will be finalized by EnhancedAmendmentService)
                    originalTask.IsReopened = true;
                    originalTask.ReopenCount = currentReopenCount; // EnhancedAmendmentService will increment this
                    originalTask.UpdatedAt = DateTime.UtcNow;
                    
                    await _taskService.UpdateTaskAsync(originalTask, userId, userName);
                    
                    _logger.LogInformation("Original task {TaskId} updated in-place successfully", id);
                }
                else
                {
                    // Edge case: original task was hard-deleted from the tasks table.
                    // Fall back to re-inserting with explicit ID preservation if possible,
                    // but since TaskId is auto-generated, we must create a new one.
                    _logger.LogWarning("Original task {TaskId} not found in tasks table. Creating new task as fallback.", id);
                    
                    var fallbackTask = new TaskEntity
                    {
                        SerialNumber = completedTask.SerialNumber,
                        PartNumber = completedTask.PartNumber,
                        PoNumber = completedTask.PoNumber,
                        Description = completedTask.Description,
                        CategoryId = completedTask.CategoryId,
                        SubTypeId = completedTask.SubTypeId,
                        RequestTypeId = completedTask.RequestTypeId,
                        Status = Enum.TryParse<TaskStatusEnum>(request.Status, out var fbStatus) ? fbStatus : TaskStatusEnum.Pending,
                        Comments = $"{completedTask.Comments}\n\n[REOPENED by {userName}]: {request.ReopenComment}",
                        AssignedEngineer = string.Join(", ", request.AssignedEngineer),
                        PriorityId = completedTask.PriorityId,
                        EstimatedCompletionDate = completedTask.EstimatedCompletionDate,
                        TargetCompletionDate = completedTask.TargetCompletionDate,
                        ActualCompletionDate = null,
                        AttachmentPath = completedTask.AttachmentPath,
                        AmendmentRequest = completedTask.AmendmentRequest,
                        AmendmentStatus = completedTask.AmendmentStatus,
                        AmendmentReviewedByTlId = completedTask.AmendmentReviewedByTlId,
                        IsDuplicate = completedTask.IsDuplicate,
                        DuplicateJustification = completedTask.DuplicateJustification,
                        RevisionNotes = $"[REOPENED from completed task {completedTask.CompletedTaskId}] {completedTask.RevisionNotes}",
                        ShowRevisionAlert = true,
                        ShopId = completedTask.ShopId,
                        CreatedBy = completedTask.CreatedBy,
                        IsMandatory = completedTask.IsMandatory,
                        IsReopened = true,
                        ReopenCount = currentReopenCount,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    
                    var createdFallback = await _taskService.CreateTaskAsync(fallbackTask);
                    // Update id reference so the rest of the method uses the correct task
                    id = createdFallback.TaskId;
                    
                    _logger.LogInformation("Fallback: Created new task {TaskId} because original was not found", id);
                }
                
                // Step 3: Use EnhancedAmendmentService to properly track the reopen action with audit trail
                _logger.LogInformation("Calling EnhancedAmendmentService.ReopenTaskWithAuditAsync for task {TaskId}", id);
                
                var reopenResult = await _enhancedAmendmentService.ReopenTaskWithAuditAsync(
                    id, 
                    userId, 
                    request.ReopenComment, 
                    request.AssignedEngineer, 
                    request.Status);
                
                if (!reopenResult.IsSuccess)
                {
                    _logger.LogWarning("EnhancedAmendmentService.ReopenTaskWithAuditAsync returned error: {Error}", 
                        reopenResult.Errors?.FirstOrDefault());
                }
                
                // Step 4: Remove from completed_tasks table
                await _completedTaskService.DeleteCompletedTaskAsync(completedTask.CompletedTaskId);

                // Reload task to get the updated reopen tracking data
                var finalTask = await _taskService.GetTaskByIdAsync(id);
                
                _logger.LogInformation("Task {TaskId} reopened successfully by user {UserId} ({UserName}). ReopenCount: {ReopenCount}, ReopenedBy: {ReopenedBy}, ReopenedAt: {ReopenedAt}", 
                    id, userId, userName, finalTask!.ReopenCount, finalTask.ReopenedBy, finalTask.ReopenedAt);

                return Ok(new { 
                    message = "Task reopened successfully and moved back to active tasks",
                    taskId = id,
                    originalTaskId = id,
                    reopenCount = finalTask.ReopenCount
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reopening task {TaskId}. Details: {Message}", id, ex.Message);
                return StatusCode(500, new { error = "An error occurred while reopening the task", details = ex.Message });
            }
        }

        /// <summary>
        /// Get tasks by user ID
        /// </summary>
        [HttpGet("user/{userId}")]
        public async Task<ActionResult<IEnumerable<TaskDto>>> GetTasksByUser(int userId)
        {
            try
            {
                var tasks = await _taskService.GetTasksByUserIdAsync(userId);

                var taskDtos = tasks.Select(t => new TaskDto
                {
                    TaskId = t.TaskId,
                    SerialNumber = t.SerialNumber ?? "",
                    PartNumber = t.PartNumber ?? "",
                    PoNumber = t.PoNumber ?? "",
                    Description = t.Description,
                    CategoryId = t.CategoryId,
                    CategoryName = t.Category?.Name ?? "Unknown",
                    Status = t.Status,
                    Comments = t.Comments,
                    AssignedEngineer = t.AssignedEngineer ?? "Unassigned",
                    PriorityId = t.PriorityId,
                    PriorityName = t.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = t.EstimatedCompletionDate,
                    TargetCompletionDate = t.TargetCompletionDate,
                    ActualCompletionDate = t.ActualCompletionDate,
                    AttachmentPath = t.AttachmentPath,
                    AttachmentsCount = t.Attachments?.Count ?? (string.IsNullOrEmpty(t.AttachmentPath) ? 0 : 1),
                    ShopId = t.ShopId ?? t.Creator?.ShopId,
                    ShopName = t.Shop?.Name ?? t.Creator?.Shop?.Name ?? "Unknown",
                    PhoneExtension = t.Creator?.PhoneNumber,
                    EngineerPhoneNumber = null, // Phone resolved on individual task detail requests
                    CreatedBy = t.CreatedBy,
                    CreatedByName = t.Creator?.FullName ?? "Unknown",
                    CreatedAt = t.CreatedAt,
                    UpdatedAt = t.UpdatedAt,
                    
                    // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                    StatusChangedAt = t.StatusChangedAt,
                    // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                    // but an already-assigned engineer show a real timestamp instead of
                    // "Not yet assigned" on the frontend.
                    AssignedAt = ResolveAssignedAt(t.AssignedEngineer, t.AssignedAt, t.UpdatedAt, t.CreatedAt),
                    
                    // Include amendment fields
                    AmendmentRequest = t.AmendmentRequest,
                    AmendmentStatus = t.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(t.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = t.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = t.AmendmentReviewer?.FullName,
                    
                    // Include reopened fields
                    IsReopened = t.IsReopened,
                    ReopenCount = t.ReopenCount,
                    ReopenedBy = t.ReopenedBy,
                    ReopenedByName = t.ReopenedByUser?.FullName,
                    ReopenedAt = t.ReopenedAt,
                    ReopenReason = t.ReopenReason,

                    IsDuplicate = t.IsDuplicate,
                    DuplicateJustification = t.DuplicateJustification,

                    RevisionNotes = t.RevisionNotes,
                    ShowRevisionAlert = t.ShowRevisionAlert
                }).ToList();

                return Ok(taskDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user tasks for user {UserId}", userId);
                return StatusCode(500, new { message = "An error occurred while retrieving user tasks", error = ex.Message });
            }
        }

        /// <summary>
        /// Get tasks by shop ID
        /// </summary>
        [HttpGet("shop/{shopId}")]
        public async Task<ActionResult<IEnumerable<TaskDto>>> GetTasksByShop(int shopId)
        {
            try
            {
                var (tasks, totalCount) = await _taskService.GetTasksWithFiltersAsync(
                    null, null, null, null, null, null, 1, 1000);

                var shopTasks = tasks.Where(t => t.ShopId == shopId);

                var taskDtos = shopTasks.Select(t => new TaskDto
                {
                    TaskId = t.TaskId,
                    SerialNumber = t.SerialNumber ?? "",
                    PartNumber = t.PartNumber ?? "",
                    PoNumber = t.PoNumber ?? "",
                    Description = t.Description,
                    CategoryId = t.CategoryId,
                    CategoryName = t.Category?.Name ?? "Unknown",
                    Status = t.Status,
                    Comments = t.Comments,
                    AssignedEngineer = t.AssignedEngineer ?? "Unassigned",
                    PriorityId = t.PriorityId,
                    PriorityName = t.Priority?.LevelName ?? "Unknown",
                    EstimatedCompletionDate = t.EstimatedCompletionDate,
                    TargetCompletionDate = t.TargetCompletionDate,
                    ActualCompletionDate = t.ActualCompletionDate,
                    AttachmentPath = t.AttachmentPath,
                    AttachmentsCount = t.Attachments?.Count ?? (string.IsNullOrEmpty(t.AttachmentPath) ? 0 : 1),
                    ShopId = t.ShopId ?? t.Creator?.ShopId,
                    ShopName = t.Shop?.Name ?? t.Creator?.Shop?.Name ?? "Unknown",
                    PhoneExtension = t.Creator?.PhoneNumber,
                    EngineerPhoneNumber = null, // Phone resolved on individual task detail requests
                    CreatedBy = t.CreatedBy,
                    CreatedByName = t.Creator?.FullName ?? "Unknown",
                    CreatedAt = t.CreatedAt,
                    UpdatedAt = t.UpdatedAt,
                    
                    // BUG FIX: Include StatusChangedAt for synchronization of overdue indicators
                    StatusChangedAt = t.StatusChangedAt,
                    // BUG FIX: Use ResolveAssignedAt so legacy tasks with a NULL AssignedAt
                    // but an already-assigned engineer show a real timestamp instead of
                    // "Not yet assigned" on the frontend.
                    AssignedAt = ResolveAssignedAt(t.AssignedEngineer, t.AssignedAt, t.UpdatedAt, t.CreatedAt),
                    
                    // Include amendment fields
                    AmendmentRequest = t.AmendmentRequest,
                    AmendmentStatus = t.AmendmentStatus.HasValue ? MapDomainAmendmentStatusToDTO(t.AmendmentStatus.Value) : null,
                    AmendmentReviewedByTlId = t.AmendmentReviewedByTlId,
                    AmendmentReviewedByName = t.AmendmentReviewer?.FullName,
                    
                    // Include reopened fields
                    IsReopened = t.IsReopened,
                    ReopenCount = t.ReopenCount,
                    ReopenedBy = t.ReopenedBy,
                    ReopenedByName = t.ReopenedByUser?.FullName,
                    ReopenedAt = t.ReopenedAt,
                    ReopenReason = t.ReopenReason,

                    IsDuplicate = t.IsDuplicate,
                    DuplicateJustification = t.DuplicateJustification,

                    RevisionNotes = t.RevisionNotes,
                    ShowRevisionAlert = t.ShowRevisionAlert
                }).ToList();

                return Ok(taskDtos);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving shop tasks for shop {ShopId}", shopId);
                return StatusCode(500, new { message = "An error occurred while retrieving shop tasks", error = ex.Message });
            }
        }

        /// <summary>
        /// Check for duplicate tasks
        /// </summary>
        [HttpPost("check-duplicates")]
        public ActionResult CheckTaskDuplicates([FromBody] object taskData)
        {
            try
            {
                return Ok(new { duplicates = new object[0] });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking for duplicates");
                return StatusCode(500, new { message = "An error occurred while checking for duplicates", error = ex.Message });
            }
        }
    }

    public class TaskUpdateHistoryDto
    {
        public int UpdateHistoryId { get; set; }
        public int TaskId { get; set; }
        public int UpdatedByUserId { get; set; }
        public string UpdatedByUserName { get; set; } = string.Empty;
        public string? UpdatedByUserRole { get; set; }
        public string UpdateType { get; set; } = string.Empty;
        public string? FieldName { get; set; }
        public string? OldValue { get; set; }
        public string? NewValue { get; set; }
        public string? UpdateComment { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class UpdateTaskStatusRequest
    {
        public TaskStatusEnum Status { get; set; }
    }

    public class ReopenTaskRequest
    {
        public string Status { get; set; } = "Pending";
        public string ReopenComment { get; set; } = "";
        public List<string> AssignedEngineer { get; set; } = new List<string>();
    }

    public class AmendmentReviewRequestDto
    {
        // Frontend field names (from AmendmentApprovalModal)
        public int? amendment_status { get; set; }
        public string? amendment_decision { get; set; }
        public string? amendment_comments { get; set; }
        public int? reviewed_by { get; set; }
        public string? reviewed_at { get; set; }
        public string? reviewer_role { get; set; }
        public int? amendment_reviewed_by_tl_id { get; set; }

        // Backend field names (existing)
        public DTOAmendmentStatus Status { get; set; }
        public string? ReviewComments { get; set; }
    }

    public class RequestAmendmentDto
    {
        public string AmendmentReason { get; set; } = string.Empty;
    }

    public class InterventionRequestDto
    {
        public string? intervention_comment_text { get; set; }
        public string? InterventionText { get; set; }
        public string? escalation_level { get; set; } = "team_lead";
        public int? user_id { get; set; }
        public string? user_role { get; set; }
    }

    public class CommentDto
    {
        public int CommentId { get; set; }
        public int TaskId { get; set; }
        public string Content { get; set; } = string.Empty;
        public int? AuthorId { get; set; }
        public string AuthorName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string CommentType { get; set; } = "UserComment";
    }

    public class AddCommentDto
    {
        public string comment_text { get; set; } = string.Empty;
    }

    public class InterventionRequest
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int RequestedBy { get; set; }
        public DateTime RequestedAt { get; set; }
        public string EscalationLevel { get; set; } = "team_lead";
        public string Status { get; set; } = "pending";
        public string Comments { get; set; } = string.Empty;
        public string UserRole { get; set; } = string.Empty;
        public DateTime? AcknowledgedAt { get; set; }
        public int? AcknowledgedBy { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedBy { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ApproveRejectCompletionDto
    {
        public string? Comment { get; set; }
    }
}