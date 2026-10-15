using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainTask = CMT.Domain.Models.Task;

namespace CMT.Application.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<DashboardService> _logger;

        public DashboardService(ApplicationDbContext context, ILogger<DashboardService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async System.Threading.Tasks.Task<DashboardMetricsDto> GetDashboardMetricsAsync(int? userId = null, string? userRole = null, int? userShopId = null)
        {
            try
            {
                _logger.LogInformation("Getting dashboard metrics for userId={UserId}, role={UserRole}, shopId={ShopId}", 
                    userId, userRole, userShopId);

                // Get active tasks
                var activeTasksQuery = _context.Tasks
                    .Where(t => t.RecordStatus == RecordStatus.Active)
                    .Include(t => t.Creator)
                        .ThenInclude(c => c.Shop)
                    .Include(t => t.Shop)
                    .Include(t => t.Category)
                    .Include(t => t.Priority)
                    .AsQueryable();

                // Get completed tasks
                var completedTasksQuery = _context.CompletedTasks
                    .Where(ct => ct.RecordStatus == RecordStatus.Active)
                    .Include(ct => ct.Creator)
                        .ThenInclude(c => c.Shop)
                    .Include(ct => ct.Shop)
                    .Include(ct => ct.Category)
                    .Include(ct => ct.Priority)
                    .AsQueryable();

                // Apply role-based filtering
                bool isRoleBasedView = false;
                string scopedRole = userRole?.ToLower() ?? "";

                if (userId.HasValue && !string.IsNullOrEmpty(userRole))
                {
                    switch (scopedRole)
                    {
                        case "engineer":
                            // Engineers see tasks assigned to them
                            var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId.Value);
                            if (user != null)
                            {
                                var userName = user.FullName;
                                activeTasksQuery = activeTasksQuery.Where(t => 
                                    t.AssignedEngineer != null && t.AssignedEngineer.Contains(userName));
                                completedTasksQuery = completedTasksQuery.Where(ct => 
                                    ct.AssignedEngineer != null && ct.AssignedEngineer.Contains(userName));
                                isRoleBasedView = true;
                            }
                            break;

                        case "customer":
                        case "customer_personnel":
                            // Customers see tasks they created
                            activeTasksQuery = activeTasksQuery.Where(t => t.CreatedBy == userId.Value);
                            completedTasksQuery = completedTasksQuery.Where(ct => ct.CreatedBy == userId.Value);
                            isRoleBasedView = true;
                            break;

                        case "shop_tl":
                            // Shop TL sees tasks created by themselves AND users they created
                            if (userId.HasValue)
                            {
                                var currentUser = await _context.Users
                                    .FirstOrDefaultAsync(u => u.UserId == userId.Value);
                                
                                if (currentUser != null)
                                {
                                    // Get all users created by this shop_tl
                                    var createdUserIds = await _context.Users
                                        .Where(u => u.CreatedByUserId == userId.Value && 
                                                   u.Status == UserStatus.Active)
                                        .Select(u => u.UserId)
                                        .ToListAsync();

                                    // Include the shop_tl's own userId
                                    var allUserIds = new List<int> { userId.Value };
                                    allUserIds.AddRange(createdUserIds);

                                    _logger.LogInformation("Shop TL {UserId} can see tasks from users: {UserIds}", 
                                        userId.Value, string.Join(", ", allUserIds));

                                    // Filter tasks
                                    activeTasksQuery = activeTasksQuery.Where(t => allUserIds.Contains(t.CreatedBy));
                                    completedTasksQuery = completedTasksQuery.Where(ct => allUserIds.Contains(ct.CreatedBy));
                                    isRoleBasedView = true;
                                }
                                else
                                {
                                    _logger.LogWarning("Shop TL user {UserId} not found", userId.Value);
                                }
                            }
                            break;

                        case "manager":
                            // Manager sees tasks from Shop Team Leaders assigned to them and their created users
                            if (userId.HasValue)
                            {
                                _logger.LogInformation("Manager {UserId} dashboard - filtering tasks", userId.Value);

                                // Get Shop Team Leaders managed by this manager
                                var shopTeamLeaders = await _context.Users
                                    .Where(u => u.ManagerId == userId.Value && 
                                               u.Role == DomainUserRole.ShopTL && 
                                               u.Status == UserStatus.Active)
                                    .Select(u => u.UserId)
                                    .ToListAsync();

                                _logger.LogInformation("Manager {UserId} manages {Count} Shop Team Leaders: {ShopTLIds}", 
                                    userId.Value, shopTeamLeaders.Count, string.Join(", ", shopTeamLeaders));

                                // Build the complete list of user IDs in Manager's scope
                                var allManagedUserIds = new List<int>();
                                
                                foreach (var shopTLId in shopTeamLeaders)
                                {
                                    // Add the Shop TL themselves
                                    allManagedUserIds.Add(shopTLId);
                                    
                                    // Add all users created by this Shop TL (Customer Personnel)
                                    var createdByShopTL = await _context.Users
                                        .Where(u => u.CreatedByUserId == shopTLId && u.Status == UserStatus.Active)
                                        .Select(u => u.UserId)
                                        .ToListAsync();
                                    
                                    allManagedUserIds.AddRange(createdByShopTL);
                                }

                                _logger.LogInformation("Manager {UserId} scope includes {Count} user IDs: {UserIds}", 
                                    userId.Value, allManagedUserIds.Count, string.Join(", ", allManagedUserIds));

                                if (allManagedUserIds.Any())
                                {
                                    // Filter tasks to ONLY those created by users in Manager's scope
                                    activeTasksQuery = activeTasksQuery.Where(t => allManagedUserIds.Contains(t.CreatedBy));
                                    completedTasksQuery = completedTasksQuery.Where(ct => allManagedUserIds.Contains(ct.CreatedBy));
                                    isRoleBasedView = true;
                                }
                                else
                                {
                                    _logger.LogWarning("Manager {UserId} has no Shop Team Leaders assigned", userId.Value);
                                    // Return empty metrics if no Shop Team Leaders assigned
                                    activeTasksQuery = activeTasksQuery.Where(t => false);
                                    completedTasksQuery = completedTasksQuery.Where(ct => false);
                                    isRoleBasedView = true;
                                }
                            }
                            break;

                        case "director":
                            // CRITICAL FIX: Directors see tasks from departments they OWN (where Department.DirectorId = userId)
                            if (userId.HasValue)
                            {
                                _logger.LogInformation("Director {UserId} dashboard - filtering tasks by owned departments", userId.Value);

                                // Get departments owned by this director (Department.DirectorId = userId)
                                var ownedDepartmentIds = await _context.Departments
                                    .Where(d => d.DirectorId == userId.Value && d.IsActive)
                                    .Select(d => d.DepartmentId)
                                    .ToListAsync();

                                _logger.LogInformation("Director {UserId} owns {Count} departments: [{DeptIds}]", 
                                    userId.Value, ownedDepartmentIds.Count, string.Join(", ", ownedDepartmentIds));

                                if (ownedDepartmentIds.Any())
                                {
                                    // Get all user IDs within these departments using the helper method
                                    var departmentUserIds = await GetDepartmentHierarchyUserIdsAsync(ownedDepartmentIds);

                                    _logger.LogInformation("Director {UserId} can see tasks from {Count} users across {DeptCount} departments", 
                                        userId.Value, departmentUserIds.Count, ownedDepartmentIds.Count);

                                    if (departmentUserIds.Any())
                                    {
                                        // Filter tasks to ONLY those created by users in Director's departments
                                        activeTasksQuery = activeTasksQuery.Where(t => departmentUserIds.Contains(t.CreatedBy));
                                        completedTasksQuery = completedTasksQuery.Where(ct => departmentUserIds.Contains(ct.CreatedBy));
                                        isRoleBasedView = true;
                                        
                                        _logger.LogInformation("Director {UserId} task filtering applied successfully", userId.Value);
                                    }
                                    else
                                    {
                                        _logger.LogWarning("Director {UserId} has no users in owned departments", userId.Value);
                                        // Return empty metrics if no users in departments
                                        activeTasksQuery = activeTasksQuery.Where(t => false);
                                        completedTasksQuery = completedTasksQuery.Where(ct => false);
                                        isRoleBasedView = true;
                                    }
                                }
                                else
                                {
                                    _logger.LogWarning("Director {UserId} owns no departments (DirectorId field not set)", userId.Value);
                                    // Return empty metrics if no departments owned
                                    activeTasksQuery = activeTasksQuery.Where(t => false);
                                    completedTasksQuery = completedTasksQuery.Where(ct => false);
                                    isRoleBasedView = true;
                                }
                            }
                            break;

                        case "team_leader":
                        case "admin":
                        case "administrator":
                            // Team leaders and admins see all tasks
                            _logger.LogInformation("User {UserId} with role {Role} can see all tasks", userId.Value, userRole);
                            break;
                    }
                }

                // Execute queries
                var activeTasks = await activeTasksQuery.ToListAsync();
                var completedTasks = await completedTasksQuery.ToListAsync();

                // Calculate metrics correctly
                var totalCompletedTasks = completedTasks.Count;
                var totalActiveTasks = activeTasks.Count;
                var totalTasks = totalCompletedTasks + totalActiveTasks; // ALL tasks (active + completed)

                // Pending tasks include all active (non-completed, non-rejected, non-cancelled) statuses
                // This matches the WorkloadService's ActiveCount definition:
                // Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval
                // so that the dashboard "Pending Tasks" metric equals the Engineer Workload "Total Active Tasks" count.
                var pendingTasks = activeTasks.Count(t => 
                    t.Status == DomainTaskStatus.Pending || 
                    t.Status == DomainTaskStatus.InProgress || 
                    t.Status == DomainTaskStatus.OnHold ||
                    t.Status == DomainTaskStatus.Blocked ||
                    t.Status == DomainTaskStatus.Paused ||
                    t.Status == DomainTaskStatus.PendingTLApproval);

                var inProgressTasks = activeTasks.Count(t => t.Status == DomainTaskStatus.InProgress);
                
                // Separate count for OnHold tasks
                var onHoldTasks = activeTasks.Count(t => t.Status == DomainTaskStatus.OnHold);

                var overdueTasks = activeTasks.Count(t => 
                    t.EstimatedCompletionDate < DateTime.Now && 
                    t.Status != DomainTaskStatus.Completed &&
                    t.Status != DomainTaskStatus.OnHold);

                // Completion rate = (completed / total) * 100
                var completionRate = totalTasks > 0 ? ((double)totalCompletedTasks / totalTasks) * 100.0 : 0.0;

                // Calculate average delay using ONLY completed tasks
                var avgDelayDays = await CalculateAverageDelayAsync(completedTasks);

                // Get recent tasks (mix of active and completed)
                var recentActiveTasks = activeTasks
                    .OrderByDescending(t => t.CreatedAt)
                    .Take(5)
                    .Select(t => new RecentTaskDto
                    {
                        TaskId = t.TaskId,
                        Description = t.Description,
                        Status = GetHumanReadableStatus(t.Status),
                        CreatedByName = t.Creator?.FullName ?? "Unknown",
                        CreatedAt = t.CreatedAt,
                        CompletedAt = null,
                        CategoryName = t.Category?.Name,
                        PriorityName = t.Priority?.LevelName,
                        IsCompleted = false,
                        OnHoldDate = t.Status == DomainTaskStatus.OnHold ? t.UpdatedAt : null,
                        DaysWorkedBeforeHold = null
                    });

                var recentCompletedTasks = completedTasks
                    .OrderByDescending(ct => ct.CompletedAt)
                    .Take(5)
                    .Select(ct => new RecentTaskDto
                    {
                        TaskId = ct.OriginalTaskId,
                        Description = ct.Description,
                        Status = "Completed",
                        CreatedByName = ct.Creator?.FullName ?? "Unknown",
                        CreatedAt = ct.TaskCreatedAt,
                        CompletedAt = ct.CompletedAt,
                        CategoryName = ct.Category?.Name,
                        PriorityName = ct.Priority?.LevelName,
                        IsCompleted = true
                    });

                var recentTasks = recentActiveTasks
                    .Concat(recentCompletedTasks)
                    .OrderByDescending(t => t.IsCompleted ? t.CompletedAt : t.CreatedAt)
                    .Take(10)
                    .ToList();

                // Task status breakdown - show ALL statuses with their counts
                var statusBreakdown = new Dictionary<string, int>();
                
                // Count active tasks by status
                foreach (var task in activeTasks)
                {
                    var statusName = GetHumanReadableStatus(task.Status);
                    if (statusBreakdown.ContainsKey(statusName))
                        statusBreakdown[statusName]++;
                    else
                        statusBreakdown[statusName] = 1;
                }
                
                // Add completed tasks
                if (totalCompletedTasks > 0)
                {
                    statusBreakdown["Completed"] = totalCompletedTasks;
                }

                // Get OnHold task details with hold request information
                var onHoldTaskDetails = await GetOnHoldTaskDetailsAsync(activeTasks.Where(t => t.Status == DomainTaskStatus.OnHold).ToList());

                // Get shop name if applicable
                string? shopName = null;
                if (userShopId.HasValue)
                {
                    var shop = await _context.Shops.FirstOrDefaultAsync(s => s.ShopId == userShopId.Value);
                    shopName = shop?.Name;
                }

                var result = new DashboardMetricsDto
                {
                    TotalTasks = totalTasks,
                    TasksCompleted = totalCompletedTasks,
                    PendingTasks = pendingTasks,
                    InProgressTasks = inProgressTasks,
                    OverdueTasks = overdueTasks,
                    OnHoldTasks = onHoldTasks,
                    CompletionRate = completionRate,
                    AvgDelayDays = avgDelayDays,
                    RecentTasks = recentTasks,
                    TaskStatusBreakdown = statusBreakdown,
                    OnHoldTaskDetails = onHoldTaskDetails,
                    UserRole = userRole ?? "Unknown",
                    UserShopId = userShopId,
                    UserShopName = shopName,
                    IsRoleBasedView = isRoleBasedView
                };

                _logger.LogInformation("Dashboard metrics calculated: Total={Total}, Completed={Completed}, Pending={Pending}, OnHold={OnHold}, CompletionRate={Rate:F2}%, AvgDelay={Delay:F2} days", 
                    totalTasks, totalCompletedTasks, pendingTasks, onHoldTasks, completionRate, avgDelayDays);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating dashboard metrics");
                throw;
            }
        }

        // Helper method to get all user IDs within multiple departments
        private async System.Threading.Tasks.Task<List<int>> GetDepartmentHierarchyUserIdsAsync(List<int> departmentIds)
        {
            var userIds = new List<int>();

            foreach (var departmentId in departmentIds)
            {
                // Get all managers in this department
                var managers = await _context.Users
                    .Where(u => u.DepartmentId == departmentId && 
                               u.Role == DomainUserRole.Manager && 
                               u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();

                _logger.LogInformation("Department {DepartmentId} has {Count} managers", departmentId, managers.Count);

                foreach (var managerId in managers)
                {
                    // Add the manager
                    userIds.Add(managerId);

                    // Get Shop Team Leaders managed by this manager
                    var shopTeamLeaders = await _context.Users
                        .Where(u => u.ManagerId == managerId && 
                                   u.Role == DomainUserRole.ShopTL && 
                                   u.Status == UserStatus.Active)
                        .Select(u => u.UserId)
                        .ToListAsync();

                    foreach (var shopTLId in shopTeamLeaders)
                    {
                        // Add the Shop TL
                        userIds.Add(shopTLId);

                        // Add all users created by this Shop TL (Customer Personnel)
                        var customerPersonnel = await _context.Users
                            .Where(u => u.CreatedByUserId == shopTLId && u.Status == UserStatus.Active)
                            .Select(u => u.UserId)
                            .ToListAsync();

                        userIds.AddRange(customerPersonnel);
                    }
                }

                // Also include engineers in the department (if any)
                var engineers = await _context.Users
                    .Where(u => u.DepartmentId == departmentId && 
                               u.Role == DomainUserRole.Engineer && 
                               u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();

                userIds.AddRange(engineers);

                // Also include team leaders in the department (if any)
                var teamLeaders = await _context.Users
                    .Where(u => u.DepartmentId == departmentId && 
                               u.Role == DomainUserRole.TeamLeader && 
                               u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();

                userIds.AddRange(teamLeaders);
            }

            return userIds.Distinct().ToList();
        }

        // Get detailed information about OnHold tasks
        private async System.Threading.Tasks.Task<List<OnHoldTaskDetailDto>> GetOnHoldTaskDetailsAsync(List<DomainTask> onHoldTasks)
        {
            var details = new List<OnHoldTaskDetailDto>();

            foreach (var task in onHoldTasks)
            {
                // Get the most recent hold request for this task
                var holdRequest = await _context.Set<TaskHoldRequest>()
                    .Where(hr => hr.TaskId == task.TaskId)
                    .Include(hr => hr.ReviewedByTl)
                    .OrderByDescending(hr => hr.HoldRequestedDate)
                    .FirstOrDefaultAsync();

                if (holdRequest != null)
                {
                    details.Add(new OnHoldTaskDetailDto
                    {
                        TaskId = task.TaskId,
                        Description = task.Description,
                        SerialNumber = task.SerialNumber ?? "",
                        AssignedEngineer = task.AssignedEngineer,
                        OnHoldDate = holdRequest.HoldRequestedDate,
                        DaysWorkedBeforeHold = holdRequest.DaysWorkedByEngineer,
                        HoldReason = holdRequest.HoldReason,
                        HoldStatus = holdRequest.Status,
                        ReviewDate = holdRequest.ReviewDate,
                        ReviewedByName = holdRequest.ReviewedByTl?.FullName,
                        ActionTaken = holdRequest.ActionTaken
                    });
                }
            }

            return details;
        }

        public async System.Threading.Tasks.Task<UserPerformanceMetricsDto> GetUserPerformanceMetricsAsync(int userId)
        {
            try
            {
                var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
                if (user == null)
                    throw new InvalidOperationException($"User with ID {userId} not found");

                // Get completed tasks created by user
                var completedTasks = await _context.CompletedTasks
                    .Where(ct => ct.CreatedBy == userId && ct.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                // Get active tasks created by user
                var activeTasks = await _context.Tasks
                    .Where(t => t.CreatedBy == userId && t.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                var totalCompletedTasks = completedTasks.Count;
                var totalActiveTasks = activeTasks.Count;
                var totalTasks = totalCompletedTasks + totalActiveTasks;
                var tasksCompleted = completedTasks.Count;
                // Consistent with WorkloadService ActiveCount: Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval
                var pendingTasks = activeTasks.Count(t => 
                    t.Status == DomainTaskStatus.Pending || 
                    t.Status == DomainTaskStatus.InProgress || 
                    t.Status == DomainTaskStatus.OnHold ||
                    t.Status == DomainTaskStatus.Blocked ||
                    t.Status == DomainTaskStatus.Paused ||
                    t.Status == DomainTaskStatus.PendingTLApproval);
                var onHoldTasks = activeTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
                var overdueTasks = activeTasks.Count(t => 
                    t.EstimatedCompletionDate < DateTime.Now && 
                    t.Status != DomainTaskStatus.Completed &&
                    t.Status != DomainTaskStatus.OnHold);

                var completionRate = totalTasks > 0 ? ((double)totalCompletedTasks / totalTasks) * 100.0 : 0.0;
                var avgDelayDays = await CalculateAverageDelayAsync(completedTasks);

                // Calculate total days worked on OnHold tasks
                var totalDaysWorkedOnHoldTasks = await CalculateTotalDaysWorkedOnHoldTasksAsync(userId);

                // Calculate transferred days (for Team Leaders)
                var transferredDaysFromEngineers = 0;
                if (user.Role == DomainUserRole.TeamLeader)
                {
                    transferredDaysFromEngineers = await CalculateTransferredDaysAsync(userId);
                }

                var lastTaskCreated = activeTasks.Concat(completedTasks.Select(ct => new DomainTask 
                { 
                    CreatedAt = ct.TaskCreatedAt 
                }))
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefault()?.CreatedAt ?? DateTime.MinValue;

                var lastTaskCompleted = completedTasks
                    .OrderByDescending(ct => ct.CompletedAt)
                    .FirstOrDefault()?.CompletedAt;

                return new UserPerformanceMetricsDto
                {
                    UserId = userId,
                    UserName = user.FullName,
                    UserRole = ConvertUserRoleToString(user.Role),
                    TotalTasks = totalTasks,
                    TasksCompleted = tasksCompleted,
                    PendingTasks = pendingTasks,
                    OverdueTasks = overdueTasks,
                    OnHoldTasks = onHoldTasks,
                    CompletionRate = completionRate,
                    AvgDelayDays = avgDelayDays,
                    LastTaskCreated = lastTaskCreated,
                    LastTaskCompleted = lastTaskCompleted,
                    TotalDaysWorkedOnHoldTasks = totalDaysWorkedOnHoldTasks,
                    TransferredDaysFromEngineers = transferredDaysFromEngineers
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating user performance metrics for user {UserId}", userId);
                throw;
            }
        }

        // Calculate total days worked on tasks that went on hold
        private async System.Threading.Tasks.Task<int> CalculateTotalDaysWorkedOnHoldTasksAsync(int userId)
        {
            var holdRequests = await _context.Set<TaskHoldRequest>()
                .Where(hr => hr.RequestedByEngineerId == userId && hr.RecordStatus == RecordStatus.Active)
                .ToListAsync();

            return holdRequests.Sum(hr => hr.DaysWorkedByEngineer);
        }

        // Calculate days transferred from engineers (for Team Leaders)
        private async System.Threading.Tasks.Task<int> CalculateTransferredDaysAsync(int teamLeadId)
        {
            var transferredDays = await _context.Set<UserDateCount>()
                .Where(udc => udc.UserId == teamLeadId && 
                             udc.CountType == "TransferredFromEngineer" &&
                             udc.RecordStatus == RecordStatus.Active)
                .SumAsync(udc => udc.DateCount);

            return transferredDays;
        }

        public async System.Threading.Tasks.Task<ShopPerformanceMetricsDto> GetShopPerformanceMetricsAsync(int shopId)
        {
            try
            {
                var shop = await _context.Shops.FirstOrDefaultAsync(s => s.ShopId == shopId);
                if (shop == null)
                    throw new InvalidOperationException($"Shop with ID {shopId} not found");

                // Get completed tasks for shop
                var completedTasks = await _context.CompletedTasks
                    .Where(ct => ct.ShopId == shopId && ct.RecordStatus == RecordStatus.Active)
                    .Include(ct => ct.Creator)
                    .ToListAsync();

                // Get active tasks for shop
                var activeTasks = await _context.Tasks
                    .Where(t => t.ShopId == shopId && t.RecordStatus == RecordStatus.Active)
                    .Include(t => t.Creator)
                    .ToListAsync();

                var totalCompletedTasks = completedTasks.Count;
                var totalActiveTasks = activeTasks.Count;
                var totalTasks = totalCompletedTasks + totalActiveTasks;
                var tasksCompleted = completedTasks.Count;
                // Consistent with WorkloadService ActiveCount: Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval
                var pendingTasks = activeTasks.Count(t => 
                    t.Status == DomainTaskStatus.Pending || 
                    t.Status == DomainTaskStatus.InProgress || 
                    t.Status == DomainTaskStatus.OnHold ||
                    t.Status == DomainTaskStatus.Blocked ||
                    t.Status == DomainTaskStatus.Paused ||
                    t.Status == DomainTaskStatus.PendingTLApproval);
                var onHoldTasks = activeTasks.Count(t => t.Status == DomainTaskStatus.OnHold);
                var overdueTasks = activeTasks.Count(t => 
                    t.EstimatedCompletionDate < DateTime.Now && 
                    t.Status != DomainTaskStatus.Completed &&
                    t.Status != DomainTaskStatus.OnHold);

                var completionRate = totalTasks > 0 ? ((double)totalCompletedTasks / totalTasks) * 100.0 : 0.0;
                var avgDelayDays = await CalculateAverageDelayAsync(completedTasks);

                // Get active users in shop
                var activeUsers = await _context.Users
                    .Where(u => u.ShopId == shopId && u.Status == UserStatus.Active)
                    .CountAsync();

                // Get top performers
                var userIds = completedTasks
                    .Select(ct => ct.CreatedBy)
                    .Distinct()
                    .ToList();

                var topPerformers = new List<UserPerformanceMetricsDto>();
                foreach (var userId in userIds.Take(5))
                {
                    try
                    {
                        var userMetrics = await GetUserPerformanceMetricsAsync(userId);
                        topPerformers.Add(userMetrics);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get metrics for user {UserId}", userId);
                    }
                }

                topPerformers = topPerformers
                    .OrderByDescending(u => u.CompletionRate)
                    .ThenByDescending(u => u.TasksCompleted)
                    .Take(3)
                    .ToList();

                return new ShopPerformanceMetricsDto
                {
                    ShopId = shopId,
                    ShopName = shop.Name,
                    TotalTasks = totalTasks,
                    TasksCompleted = tasksCompleted,
                    PendingTasks = pendingTasks,
                    OverdueTasks = overdueTasks,
                    OnHoldTasks = onHoldTasks,
                    CompletionRate = completionRate,
                    AvgDelayDays = avgDelayDays,
                    ActiveUsers = activeUsers,
                    TopPerformers = topPerformers
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating shop performance metrics for shop {ShopId}", shopId);
                throw;
            }
        }

        public async System.Threading.Tasks.Task<List<UserPerformanceMetricsDto>> GetAllUsersPerformanceAsync()
        {
            try
            {
                var users = await _context.Users
                    .Where(u => u.Status == UserStatus.Active)
                    .ToListAsync();

                var userMetrics = new List<UserPerformanceMetricsDto>();
                
                foreach (var user in users)
                {
                    try
                    {
                        var metrics = await GetUserPerformanceMetricsAsync(user.UserId);
                        userMetrics.Add(metrics);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get metrics for user {UserId}", user.UserId);
                    }
                }

                return userMetrics.OrderByDescending(u => u.CompletionRate).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all users performance metrics");
                throw;
            }
        }

        public async System.Threading.Tasks.Task<List<ShopPerformanceMetricsDto>> GetAllShopsPerformanceAsync()
        {
            try
            {
                var shops = await _context.Shops
                    .Where(s => s.RecordStatus == RecordStatus.Active)
                    .ToListAsync();

                var shopMetrics = new List<ShopPerformanceMetricsDto>();
                
                foreach (var shop in shops)
                {
                    try
                    {
                        var metrics = await GetShopPerformanceMetricsAsync(shop.ShopId);
                        shopMetrics.Add(metrics);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to get metrics for shop {ShopId}", shop.ShopId);
                    }
                }

                return shopMetrics.OrderByDescending(s => s.CompletionRate).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all shops performance metrics");
                throw;
            }
        }

        // Calculate average delay using actual completion dates from database
        private System.Threading.Tasks.Task<double> CalculateAverageDelayAsync(List<CompletedTask> completedTasks)
        {
            if (!completedTasks.Any())
                return System.Threading.Tasks.Task.FromResult(0.0);

            var delaysInDays = new List<double>();

            foreach (var task in completedTasks)
            {
                // Use ActualCompletionDate if available, otherwise use CompletedAt
                var actualDate = task.ActualCompletionDate ?? task.CompletedAt;
                
                // Use TargetCompletionDate if available, otherwise use EstimatedCompletionDate
                var targetDate = task.TargetCompletionDate ?? task.EstimatedCompletionDate;

                // Only calculate delay if both dates are valid
                if (actualDate != DateTime.MinValue && targetDate != DateTime.MinValue)
                {
                    var delayDays = (actualDate - targetDate).TotalDays;
                    delaysInDays.Add(delayDays);
                }
            }

            var result = delaysInDays.Any() ? delaysInDays.Average() : 0;
            return System.Threading.Tasks.Task.FromResult(result);
        }

        // Convert TaskStatus enum to human-readable string
        private string GetHumanReadableStatus(DomainTaskStatus status)
        {
            return status switch
            {
                DomainTaskStatus.Pending => "Pending",
                DomainTaskStatus.InProgress => "In Progress",
                DomainTaskStatus.Completed => "Completed",
                DomainTaskStatus.Blocked => "Blocked",
                DomainTaskStatus.OnHold => "On Hold",
                DomainTaskStatus.Rejected => "Rejected",
                _ => status.ToString()
            };
        }

        private string ConvertUserRoleToString(DomainUserRole role)
        {
            return role switch
            {
                DomainUserRole.TeamLeader => "team_leader",
                DomainUserRole.Director => "director",
                DomainUserRole.Engineer => "engineer",
                DomainUserRole.CustomerPersonnel => "customer_personnel",
                DomainUserRole.Customer => "customer",
                DomainUserRole.ShopTL => "shop_tl",
                DomainUserRole.Manager => "manager",
                DomainUserRole.Admin => "admin",
                _ => "unknown"
            };
        }
    }
}