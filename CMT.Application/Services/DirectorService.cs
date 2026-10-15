using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    /// <summary>
    /// DirectorService - Restricts directors to only see data within their assigned departments
    /// CRITICAL: Directors can only access departments where Department.DirectorId = their userId
    /// ENHANCED: Now includes comprehensive logging to debug data flow issues
    /// FIXED: Ensures all tasks from Team Leaders created by Directors are visible
    /// UPDATED: Added proper display of Team Leaders created by Director on the dashboard
    /// FIXED: Directors can now see ALL tasks assigned to Team Leaders they created (regardless of department)
    /// NEW: Added GetDirectorTeamLeaderNamesAsync to support filtering by AssignedEngineer field
    /// COMPREHENSIVE FIX: Directors now see ALL tasks where assignedEngineer matches their Team Leaders' names
    /// </summary>
    public class DirectorService : IDirectorService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<DirectorService> _logger;

        public DirectorService(ApplicationDbContext context, ILogger<DirectorService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<DirectorDashboardDto> GetDirectorDashboardAsync(int directorUserId)
        {
            var director = await _context.Users
                .Include(u => u.CreatedDepartments)
                .Include(u => u.Department)
                .FirstOrDefaultAsync(u => u.UserId == directorUserId && u.Role == DomainUserRole.Director);

            if (director == null)
            {
                _logger.LogWarning("Director user {DirectorId} not found or not a director role", directorUserId);
                return new DirectorDashboardDto
                {
                    DirectorUserId = directorUserId,
                    DirectorName = "Unknown"
                };
            }

            // CRITICAL: Get ONLY departments where this director is the DirectorId (department owner)
            var departments = await _context.Departments
                .Where(d => d.DirectorId == directorUserId && d.IsActive)
                .ToListAsync();

            var departmentIds = departments.Select(d => d.DepartmentId).ToList();

            _logger.LogInformation("Director {DirectorId} ({DirectorName}) owns {Count} departments: [{DeptIds}]", 
                directorUserId, director.FullName, departments.Count, string.Join(", ", departmentIds));

            // Get all user IDs within director's scope using the helper method
            var allManagedUserIds = await GetDepartmentUserIdsAsync(directorUserId);

            _logger.LogInformation("Director {DirectorId} scope includes {Count} users across {DeptCount} departments", 
                directorUserId, allManagedUserIds.Count, departments.Count);

            // FIXED: Calculate department-specific metrics including ALL users in scope
            var totalActiveTasks = await _context.Tasks
                .Where(t => allManagedUserIds.Contains(t.CreatedBy) && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var totalCompletedTasks = await _context.CompletedTasks
                .Where(ct => allManagedUserIds.Contains(ct.CreatedBy) && 
                            ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var totalPendingTasks = await _context.Tasks
                .Where(t => allManagedUserIds.Contains(t.CreatedBy) && 
                           t.Status == DomainTaskStatus.Pending &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            _logger.LogInformation("Director {DirectorId} task counts: Active={Active}, Completed={Completed}, Pending={Pending}", 
                directorUserId, totalActiveTasks, totalCompletedTasks, totalPendingTasks);

            // Get all users within these departments for summary
            var departmentUsers = await _context.Users
                .Where(u => u.DepartmentId.HasValue && 
                           departmentIds.Contains(u.DepartmentId.Value) && 
                           u.Status == UserStatus.Active)
                .ToListAsync();

            // Get all managers within these departments
            var managers = departmentUsers
                .Where(u => u.Role == DomainUserRole.Manager)
                .ToList();

            // Get all Shop Team Leaders managed by these managers
            var managerIds = managers.Select(m => m.UserId).ToList();
            var shopTeamLeaders = await _context.Users
                .Where(u => u.ManagerId.HasValue && 
                           managerIds.Contains(u.ManagerId.Value) && 
                           u.Role == DomainUserRole.ShopTL && 
                           u.Status == UserStatus.Active)
                .ToListAsync();

            // FIXED: Get Team Leaders created directly by the Director (regardless of DepartmentId)
            var teamLeadersCreatedByDirector = await _context.Users
                .Include(u => u.Department)
                .Include(u => u.Shop)
                .Include(u => u.CreatedByUser)
                .Where(u => u.CreatedByUserId == directorUserId && 
                           u.Role == DomainUserRole.TeamLeader && 
                           u.Status == UserStatus.Active)
                .ToListAsync();

            _logger.LogInformation("Director {DirectorId} created {Count} Team Leaders directly", 
                directorUserId, teamLeadersCreatedByDirector.Count);

            // ADDED: Get Engineers created by Team Leaders (who were created by Director)
            var teamLeaderIds = teamLeadersCreatedByDirector.Select(tl => tl.UserId).ToList();
            var engineersUnderTeamLeaders = await _context.Users
                .Include(u => u.Department)
                .Include(u => u.Shop)
                .Where(u => u.CreatedByUserId.HasValue && 
                           teamLeaderIds.Contains(u.CreatedByUserId.Value) && 
                           u.Role == DomainUserRole.Engineer && 
                           u.Status == UserStatus.Active)
                .ToListAsync();

            _logger.LogInformation("Director {DirectorId} has {Count} Engineers under Team Leaders", 
                directorUserId, engineersUnderTeamLeaders.Count);

            // ADDED: Get all Engineers in director's scope (from departments + under Team Leaders)
            var allEngineers = departmentUsers
                .Where(u => u.Role == DomainUserRole.Engineer)
                .ToList();
            allEngineers.AddRange(engineersUnderTeamLeaders);
            var distinctEngineers = allEngineers.DistinctBy(e => e.UserId).ToList();

            // Build department summaries
            var departmentSummaries = new List<DepartmentSummaryDto>();
            foreach (var dept in departments)
            {
                var deptUsers = departmentUsers.Where(u => u.DepartmentId == dept.DepartmentId).ToList();
                
                // Get all managers in this department
                var deptManagers = deptUsers.Where(u => u.Role == DomainUserRole.Manager).ToList();
                var deptManagerCount = deptManagers.Count();
                
                var deptUserIds = deptUsers.Select(u => u.UserId).ToList();

                // Get Shop TLs for this department's managers
                var deptShopTLs = shopTeamLeaders.Where(stl => 
                    stl.ManagerId.HasValue && 
                    deptUsers.Any(u => u.UserId == stl.ManagerId.Value)).ToList();
                
                var deptShopTLIds = deptShopTLs.Select(stl => stl.UserId).ToList();
                deptUserIds.AddRange(deptShopTLIds);

                // Add Customer Personnel created by Shop TLs
                foreach (var shopTL in deptShopTLs)
                {
                    var createdIds = await _context.Users
                        .Where(u => u.CreatedByUserId == shopTL.UserId && u.Status == UserStatus.Active)
                        .Select(u => u.UserId)
                        .ToListAsync();
                    deptUserIds.AddRange(createdIds);
                }

                // FIXED: Get tasks for ALL users in this department's scope
                var deptScopeUserIds = allManagedUserIds.Where(uid =>
                {
                    var user = departmentUsers.FirstOrDefault(u => u.UserId == uid);
                    return user != null && user.DepartmentId == dept.DepartmentId;
                }).ToList();

                // ADDED: Include Team Leaders created by Director who are assigned to this department
                var deptTeamLeaderIds = teamLeadersCreatedByDirector
                    .Where(tl => tl.DepartmentId == dept.DepartmentId)
                    .Select(tl => tl.UserId)
                    .ToList();
                deptScopeUserIds.AddRange(deptTeamLeaderIds);

                // ADDED: Include Engineers under those Team Leaders
                var deptEngineerIds = engineersUnderTeamLeaders
                    .Where(e => deptTeamLeaderIds.Contains(e.CreatedByUserId ?? 0))
                    .Select(e => e.UserId)
                    .ToList();
                deptScopeUserIds.AddRange(deptEngineerIds);

                deptScopeUserIds = deptScopeUserIds.Distinct().ToList();

                var deptActiveTasks = await _context.Tasks
                    .Where(t => deptScopeUserIds.Contains(t.CreatedBy) && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var deptCompletedTasks = await _context.CompletedTasks
                    .Where(ct => deptScopeUserIds.Contains(ct.CreatedBy) && 
                                ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                // Get Team Leaders count for this department
                var deptTeamLeaderCount = teamLeadersCreatedByDirector
                    .Count(tl => tl.DepartmentId == dept.DepartmentId);

                // Get Engineers count for this department
                var deptEngineerCount = deptUsers.Count(u => u.Role == DomainUserRole.Engineer) +
                    engineersUnderTeamLeaders.Count(e => deptTeamLeaderIds.Contains(e.CreatedByUserId ?? 0));

                // Build manager summaries for this department
                var managerSummaries = new List<ManagerSummaryDto>();
                foreach (var manager in deptManagers)
                {
                    var managedShopTLs = shopTeamLeaders
                        .Where(stl => stl.ManagerId == manager.UserId)
                        .ToList();

                    var managedUserIds = new List<int> { manager.UserId };
                    managedUserIds.AddRange(managedShopTLs.Select(stl => stl.UserId));

                    foreach (var stl in managedShopTLs)
                    {
                        var createdBySTL = await _context.Users
                            .Where(u => u.CreatedByUserId == stl.UserId && u.Status == UserStatus.Active)
                            .Select(u => u.UserId)
                            .ToListAsync();
                        managedUserIds.AddRange(createdBySTL);
                    }

                    var managerActiveTasks = await _context.Tasks
                        .Where(t => managedUserIds.Contains(t.CreatedBy) && 
                                   t.Status != DomainTaskStatus.Completed && 
                                   t.Status != DomainTaskStatus.Rejected &&
                                   t.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var managerCompletedTasks = await _context.CompletedTasks
                        .Where(ct => managedUserIds.Contains(ct.CreatedBy) && 
                                    ct.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var totalManagerTasks = managerActiveTasks + managerCompletedTasks;
                    var completionRate = totalManagerTasks > 0 
                        ? (double)managerCompletedTasks / totalManagerTasks * 100 
                        : 0;

                    managerSummaries.Add(new ManagerSummaryDto
                    {
                        UserId = manager.UserId,
                        FullName = manager.FullName,
                        Username = manager.Username,
                        Email = manager.Email,
                        ManagedShopTeamLeaders = managedShopTLs.Count,
                        TotalManagedUsers = managedUserIds.Count - 1,
                        ActiveTasks = managerActiveTasks,
                        CompletedTasks = managerCompletedTasks,
                        CompletionRate = completionRate,
                        IsActive = manager.Status == UserStatus.Active
                    });
                }

                departmentSummaries.Add(new DepartmentSummaryDto
                {
                    DepartmentId = dept.DepartmentId,
                    DepartmentName = dept.Name,
                    Description = dept.Description,
                    Managers = managerSummaries,
                    TotalManagers = deptManagerCount,
                    TotalUsers = deptUsers.Count,
                    TotalShopTeamLeaders = deptShopTLs.Count,
                    TotalTeamLeaders = deptTeamLeaderCount,
                    TotalEngineers = deptEngineerCount,
                    ActiveTasks = deptActiveTasks,
                    CompletedTasks = deptCompletedTasks,
                    IsActive = dept.IsActive,
                    CreatedAt = dept.CreatedAt
                });
            }

            // ADDED: Create a special "Director-Created Team Leaders" summary section
            // This captures Team Leaders without department assignment
            var teamLeadersWithoutDept = teamLeadersCreatedByDirector
                .Where(tl => !tl.DepartmentId.HasValue || !departmentIds.Contains(tl.DepartmentId.Value))
                .ToList();

            if (teamLeadersWithoutDept.Any())
            {
                var tlUserIds = teamLeadersWithoutDept.Select(tl => tl.UserId).ToList();
                
                // Get engineers under these Team Leaders
                var engineersUnderTLs = engineersUnderTeamLeaders
                    .Where(e => tlUserIds.Contains(e.CreatedByUserId ?? 0))
                    .ToList();
                var engineerIds = engineersUnderTLs.Select(e => e.UserId).ToList();

                var allTLScopeUserIds = tlUserIds.Concat(engineerIds).ToList();

                var tlActiveTasks = await _context.Tasks
                    .Where(t => allTLScopeUserIds.Contains(t.CreatedBy) && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var tlCompletedTasks = await _context.CompletedTasks
                    .Where(ct => allTLScopeUserIds.Contains(ct.CreatedBy) && 
                                ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                // Build Team Leader summaries as manager summaries
                var teamLeaderSummaries = new List<ManagerSummaryDto>();
                foreach (var tl in teamLeadersWithoutDept)
                {
                    var tlEngineers = engineersUnderTeamLeaders
                        .Where(e => e.CreatedByUserId == tl.UserId)
                        .ToList();

                    var tlScopeUserIds = new List<int> { tl.UserId };
                    tlScopeUserIds.AddRange(tlEngineers.Select(e => e.UserId));

                    var tlActiveTaskCount = await _context.Tasks
                        .Where(t => tlScopeUserIds.Contains(t.CreatedBy) && 
                                   t.Status != DomainTaskStatus.Completed && 
                                   t.Status != DomainTaskStatus.Rejected &&
                                   t.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var tlCompletedTaskCount = await _context.CompletedTasks
                        .Where(ct => tlScopeUserIds.Contains(ct.CreatedBy) && 
                                    ct.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var totalTLTasks = tlActiveTaskCount + tlCompletedTaskCount;
                    var tlCompletionRate = totalTLTasks > 0 
                        ? (double)tlCompletedTaskCount / totalTLTasks * 100 
                        : 0;

                    teamLeaderSummaries.Add(new ManagerSummaryDto
                    {
                        UserId = tl.UserId,
                        FullName = tl.FullName,
                        Username = tl.Username,
                        Email = tl.Email,
                        ManagedShopTeamLeaders = 0, // Team Leaders don't manage Shop TLs
                        TotalManagedUsers = tlEngineers.Count,
                        ActiveTasks = tlActiveTaskCount,
                        CompletedTasks = tlCompletedTaskCount,
                        CompletionRate = tlCompletionRate,
                        IsActive = tl.Status == UserStatus.Active
                    });
                }

                // Add as a virtual department for "Director-Created Team Leaders"
                departmentSummaries.Add(new DepartmentSummaryDto
                {
                    DepartmentId = -1, // Special ID for director-created users without department
                    DepartmentName = "Director-Created Team Leaders",
                    Description = "Team Leaders created directly by the Director (not assigned to a specific department)",
                    Managers = teamLeaderSummaries,
                    TotalManagers = teamLeadersWithoutDept.Count,
                    TotalUsers = allTLScopeUserIds.Count,
                    TotalShopTeamLeaders = 0,
                    TotalTeamLeaders = teamLeadersWithoutDept.Count,
                    TotalEngineers = engineersUnderTLs.Count,
                    ActiveTasks = tlActiveTasks,
                    CompletedTasks = tlCompletedTasks,
                    IsActive = true,
                    CreatedAt = teamLeadersWithoutDept.Min(tl => tl.CreatedAt)
                });

                _logger.LogInformation("Director {DirectorId} has {Count} Team Leaders without department assignment, added as virtual department", 
                    directorUserId, teamLeadersWithoutDept.Count);
            }

            // Get Team Leader details for the dashboard
            var teamLeaderDetails = await GetDirectorTeamLeadersAsync(directorUserId);

            // Get recent tasks from director's scope (including Team Leaders and their Engineers)
            var recentTasks = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Where(t => allManagedUserIds.Contains(t.CreatedBy) && 
                           t.RecordStatus == RecordStatus.Active)
                .OrderByDescending(t => t.CreatedAt)
                .Take(10)
                .Select(t => new TaskSummaryDto
                {
                    TaskId = t.TaskId,
                    Description = t.Description,
                    Status = t.Status.ToString(),
                    CreatedByName = t.Creator.FullName,
                    CreatedAt = t.CreatedAt,
                    CategoryName = t.Category.Name,
                    PriorityName = t.Priority.LevelName,
                    TargetCompletionDate = t.TargetCompletionDate
                })
                .ToListAsync();

            _logger.LogInformation("Director {DirectorId} dashboard returning {TaskCount} recent tasks", 
                directorUserId, recentTasks.Count);

            // Calculate overall metrics
            var totalTasks = totalActiveTasks + totalCompletedTasks;
            var overallCompletionRate = totalTasks > 0 ? (double)totalCompletedTasks / totalTasks * 100 : 0;

            return new DirectorDashboardDto
            {
                DirectorUserId = directorUserId,
                DirectorName = director.FullName,
                Departments = departmentSummaries,
                TotalDepartments = departments.Count,
                TotalManagers = managers.Count,
                TotalShopTeamLeaders = shopTeamLeaders.Count,
                TotalTeamLeaders = teamLeadersCreatedByDirector.Count,
                TotalEngineers = distinctEngineers.Count,
                TotalUsers = allManagedUserIds.Distinct().Count(),
                TotalActiveTasks = totalActiveTasks,
                TotalCompletedTasks = totalCompletedTasks,
                TotalPendingTasks = totalPendingTasks,
                OverallCompletionRate = overallCompletionRate,
                TeamLeaders = teamLeaderDetails, // ADDED: Include Team Leader details
                RecentTasks = recentTasks
            };
        }

        public async Task<List<DepartmentDto>> GetDirectorDepartmentsAsync(int directorUserId)
        {
            // CRITICAL: Only return departments where this director is the DirectorId
            var departments = await _context.Departments
                .Where(d => d.DirectorId == directorUserId && d.IsActive)
                .Include(d => d.Users.Where(u => u.Role == DomainUserRole.Manager && u.Status == UserStatus.Active))
                .OrderBy(d => d.Name)
                .ToListAsync();

            var departmentDtos = new List<DepartmentDto>();
            
            foreach (var d in departments)
            {
                // Get all managers in this department
                var deptManagers = d.Users.Where(u => u.Role == DomainUserRole.Manager).ToList();
                var totalUsers = await _context.Users
                    .Where(u => u.DepartmentId == d.DepartmentId && u.Status == UserStatus.Active)
                    .CountAsync();

                // ADDED: Get Team Leaders in this department (created by Director)
                var teamLeaders = await _context.Users
                    .Where(u => u.CreatedByUserId == directorUserId && 
                               u.Role == DomainUserRole.TeamLeader && 
                               u.DepartmentId == d.DepartmentId &&
                               u.Status == UserStatus.Active)
                    .CountAsync();

                // ADDED: Get Engineers in this department
                var engineers = await _context.Users
                    .Where(u => u.DepartmentId == d.DepartmentId && 
                               u.Role == DomainUserRole.Engineer &&
                               u.Status == UserStatus.Active)
                    .CountAsync();

                departmentDtos.Add(new DepartmentDto
                {
                    DepartmentId = d.DepartmentId,
                    Name = d.Name,
                    Description = d.Description,
                    DirectorId = d.DirectorId,
                    ManagerId = deptManagers.FirstOrDefault()?.UserId,
                    ManagerName = deptManagers.Count > 0 
                        ? string.Join(", ", deptManagers.Select(m => m.FullName)) 
                        : null,
                    TotalUsers = totalUsers,
                    TotalTeamLeaders = teamLeaders,
                    TotalEngineers = engineers,
                    IsActive = d.IsActive,
                    CreatedAt = d.CreatedAt,
                    UpdatedAt = d.UpdatedAt
                });
            }

            return departmentDtos;
        }

        public async Task<List<UserDto>> GetDepartmentManagersAsync(int directorUserId)
        {
            // CRITICAL: Only return managers from departments where this director is the DirectorId
            var departmentIds = await _context.Departments
                .Where(d => d.DirectorId == directorUserId && d.IsActive)
                .Select(d => d.DepartmentId)
                .ToListAsync();

            var managers = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Department)
                .Where(u => u.DepartmentId.HasValue && 
                           departmentIds.Contains(u.DepartmentId.Value) && 
                           u.Role == DomainUserRole.Manager && 
                           u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var managerDtos = new List<UserDto>();
            foreach (var manager in managers)
            {
                var activeTasks = await _context.Tasks
                    .Where(t => t.CreatedBy == manager.UserId && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var completedTasks = await _context.CompletedTasks
                    .Where(ct => ct.CreatedBy == manager.UserId && 
                                ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                managerDtos.Add(new UserDto
                {
                    UserId = manager.UserId,
                    FullName = manager.FullName,
                    Username = manager.Username,
                    Email = manager.Email,
                    Role = "manager",
                    ShopId = manager.ShopId,
                    ShopName = manager.Shop?.Name,
                    DepartmentId = manager.DepartmentId,
                    DepartmentName = manager.Department?.Name,
                    IsActive = manager.Status == UserStatus.Active,
                    CreatedAt = manager.CreatedAt,
                    ActiveTasksCount = activeTasks,
                    CompletedTasksCount = completedTasks
                });
            }

            return managerDtos;
        }

        public async Task<List<UserDto>> GetDepartmentUsersAsync(int directorUserId)
        {
            // CRITICAL FIX: Get ALL users in director's scope, not just those with DepartmentId set
            var allUserIds = await GetDepartmentUserIdsAsync(directorUserId);

            if (allUserIds.Count == 0)
            {
                _logger.LogWarning("Director {DirectorId} has no users in scope", directorUserId);
                return new List<UserDto>();
            }

            var users = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Department)
                .Include(u => u.Manager)
                .Include(u => u.CreatedByUser)
                .Where(u => allUserIds.Contains(u.UserId) && u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            _logger.LogInformation("Director {DirectorId} GetDepartmentUsersAsync returning {Count} users", 
                directorUserId, users.Count);

            var userDtos = new List<UserDto>();
            foreach (var user in users)
            {
                var activeTasks = await _context.Tasks
                    .Where(t => t.CreatedBy == user.UserId && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var completedTasks = await _context.CompletedTasks
                    .Where(ct => ct.CreatedBy == user.UserId && 
                                ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                userDtos.Add(new UserDto
                {
                    UserId = user.UserId,
                    FullName = user.FullName,
                    Username = user.Username,
                    Email = user.Email,
                    Role = ConvertUserRoleToString(user.Role),
                    ShopId = user.ShopId,
                    ShopName = user.Shop?.Name,
                    DepartmentId = user.DepartmentId,
                    DepartmentName = user.Department?.Name,
                    ManagerId = user.ManagerId,
                    ManagerName = user.Manager?.FullName,
                    CreatedByUserId = user.CreatedByUserId,
                    CreatedByUserName = user.CreatedByUser?.FullName,
                    IsActive = user.Status == UserStatus.Active,
                    CreatedAt = user.CreatedAt,
                    ActiveTasksCount = activeTasks,
                    CompletedTasksCount = completedTasks
                });
            }

            return userDtos;
        }

        /// <summary>
        /// CRITICAL METHOD: Get all user IDs within director's assigned departments for task filtering
        /// This is the PRIMARY method used by TaskController to filter tasks for directors
        /// COMPREHENSIVE FIX: Captures complete user hierarchy including all nested relationships
        /// ENHANCED: Added detailed logging at each step to diagnose data flow issues
        /// FIXED: Now includes Team Leaders created directly by the Director (regardless of DepartmentId)
        /// UPDATED: Also includes ALL users that have tasks assigned to Team Leaders created by Director
        /// CRITICAL FIX: Now includes ALL users who created tasks assigned to Director's Team Leaders
        /// Returns: List of user IDs that the director can see tasks from
        /// </summary>
        public async Task<List<int>> GetDepartmentUserIdsAsync(int directorUserId)
        {
            _logger.LogInformation("╔═══════════════════════════════════════════════════════════════════╗");
            _logger.LogInformation("║ GetDepartmentUserIdsAsync START - Director {DirectorId}", directorUserId);
            _logger.LogInformation("╚═══════════════════════════════════════════════════════════════════╝");

            // STEP 1: Get ONLY departments where this director is the DirectorId (owner)
            var departments = await _context.Departments
                .Where(d => d.DirectorId == directorUserId && d.IsActive)
                .ToListAsync();

            var departmentIds = departments.Select(d => d.DepartmentId).ToList();

            // CRITICAL FIX: Even if no departments exist, we should still include users created by the Director
            if (departmentIds.Count == 0)
            {
                _logger.LogWarning("⚠ Director {DirectorId} has NO assigned departments (DirectorId field)", directorUserId);
                _logger.LogWarning("   Will still check for users created directly by the Director");
            }
            else
            {
                _logger.LogInformation("✓ STEP 1: Director {DirectorId} owns {Count} departments: [{DeptIds}]", 
                    directorUserId, departmentIds.Count, string.Join(", ", departmentIds));

                // Log department details
                foreach (var dept in departments)
                {
                    _logger.LogInformation("   └─ Department {DeptId}: '{DeptName}' (DirectorId={DirectorId})", 
                        dept.DepartmentId, dept.Name, dept.DirectorId);
                }
            }

            var allUserIds = new HashSet<int>();
            
            // CRITICAL FIX: Always include the Director's own userId so they can see their own tasks
            allUserIds.Add(directorUserId);
            _logger.LogInformation("✓ STEP 0: Added Director's own userId {DirectorId} to scope", directorUserId);

            // STEP 2: Get all users directly in these departments
            var departmentUsers = new List<User>();
            if (departmentIds.Count > 0)
            {
                departmentUsers = await _context.Users
                    .Where(u => u.DepartmentId.HasValue && 
                               departmentIds.Contains(u.DepartmentId.Value) && 
                               u.Status == UserStatus.Active)
                    .ToListAsync();

                foreach (var user in departmentUsers)
                {
                    allUserIds.Add(user.UserId);
                    _logger.LogInformation("   └─ User {UserId}: {Name} (Role={Role}, DeptId={DeptId})", 
                        user.UserId, user.FullName, user.Role, user.DepartmentId);
                }

                _logger.LogInformation("✓ STEP 2: Found {Count} users directly in departments", departmentUsers.Count);
            }

            // STEP 3: Get managers in these departments
            var managers = departmentUsers.Where(u => u.Role == DomainUserRole.Manager).ToList();
            var managerIds = managers.Select(m => m.UserId).ToList();

            _logger.LogInformation("✓ STEP 3: Found {Count} managers in departments: [{ManagerIds}]", 
                managers.Count, string.Join(", ", managerIds));

            foreach (var manager in managers)
            {
                _logger.LogInformation("   └─ Manager {UserId}: {Name} (DeptId={DeptId})", 
                    manager.UserId, manager.FullName, manager.DepartmentId);
            }

            // STEP 4: Get Shop Team Leaders managed by these managers
            var shopTLs = new List<User>();
            if (managerIds.Count > 0)
            {
                shopTLs = await _context.Users
                    .Where(u => u.ManagerId.HasValue && 
                               managerIds.Contains(u.ManagerId.Value) && 
                               u.Role == DomainUserRole.ShopTL &&
                               u.Status == UserStatus.Active)
                    .ToListAsync();

                var shopTLIds = shopTLs.Select(stl => stl.UserId).ToList();

                foreach (var id in shopTLIds)
                    allUserIds.Add(id);

                _logger.LogInformation("✓ STEP 4: Found {Count} Shop TLs managed by department managers: [{ShopTLIds}]", 
                    shopTLs.Count, string.Join(", ", shopTLIds));

                foreach (var shopTL in shopTLs)
                {
                    _logger.LogInformation("   └─ ShopTL {UserId}: {Name} (ManagerId={ManagerId}, DeptId={DeptId}, ShopId={ShopId})", 
                        shopTL.UserId, shopTL.FullName, shopTL.ManagerId, shopTL.DepartmentId, shopTL.ShopId);
                }
            }

            // STEP 5: Get customer personnel created by Shop TLs
            var customerPersonnel = new List<User>();
            foreach (var shopTL in shopTLs)
            {
                var cpUsers = await _context.Users
                    .Where(u => u.CreatedByUserId == shopTL.UserId &&
                               u.Status == UserStatus.Active)
                    .ToListAsync();

                customerPersonnel.AddRange(cpUsers);

                foreach (var cp in cpUsers)
                {
                    allUserIds.Add(cp.UserId);
                    _logger.LogInformation("   └─ CustomerPersonnel {UserId}: {Name} (CreatedBy={CreatedBy}, DeptId={DeptId})", 
                        cp.UserId, cp.FullName, cp.CreatedByUserId, cp.DepartmentId);
                }
            }

            _logger.LogInformation("✓ STEP 5: Found {Count} customer personnel created by Shop TLs", customerPersonnel.Count);

            // STEP 6: Get users created directly by managers (engineers, team leaders, additional shop TLs)
            var managerCreatedUsers = new List<User>();
            foreach (var manager in managers)
            {
                var createdUsers = await _context.Users
                    .Where(u => u.CreatedByUserId == manager.UserId &&
                               u.Status == UserStatus.Active)
                    .ToListAsync();

                managerCreatedUsers.AddRange(createdUsers);

                foreach (var user in createdUsers)
                {
                    allUserIds.Add(user.UserId);
                    _logger.LogInformation("   └─ User {UserId}: {Name} (Role={Role}, CreatedBy=Manager{ManagerId}, DeptId={DeptId})", 
                        user.UserId, user.FullName, user.Role, manager.UserId, user.DepartmentId);
                }
            }

            _logger.LogInformation("✓ STEP 6: Found {Count} users created directly by managers", managerCreatedUsers.Count);

            // STEP 7: CRITICAL - Get ALL users created DIRECTLY by the Director (regardless of DepartmentId)
            var directorCreatedUsers = await _context.Users
                .Where(u => u.CreatedByUserId == directorUserId &&
                           u.Status == UserStatus.Active)
                .ToListAsync();

            foreach (var user in directorCreatedUsers)
            {
                allUserIds.Add(user.UserId);
                _logger.LogInformation("   └─ User {UserId}: {Name} (Role={Role}, CreatedByDirector={DirectorId}, DeptId={DeptId})", 
                    user.UserId, user.FullName, user.Role, directorUserId, user.DepartmentId);
            }

            _logger.LogInformation("✓ STEP 7: Found {Count} users created DIRECTLY by Director {DirectorId}", 
                directorCreatedUsers.Count, directorUserId);

            // STEP 8: COMPREHENSIVE FIX - Recursively get all descendants of ALL created users
            // This ensures that Engineers created by Team Leaders (who were created by Director) are included
            _logger.LogInformation("✓ STEP 8: Recursively finding all descendants of created users...");
            
            var processedUserIds = new HashSet<int>(allUserIds);
            var usersToProcess = new Queue<int>();
            
            // Add all created users (manager-created + director-created) to the processing queue
            foreach (var user in managerCreatedUsers.Concat(directorCreatedUsers))
            {
                usersToProcess.Enqueue(user.UserId);
            }
            
            var recursionLevel = 0;
            var totalDescendants = 0;

            while (usersToProcess.Count > 0)
            {
                recursionLevel++;
                var currentUserId = usersToProcess.Dequeue();
                
                var descendantUsers = await _context.Users
                    .Where(u => u.CreatedByUserId == currentUserId &&
                               u.Status == UserStatus.Active &&
                               !processedUserIds.Contains(u.UserId))
                    .ToListAsync();

                foreach (var descendant in descendantUsers)
                {
                    if (allUserIds.Add(descendant.UserId))
                    {
                        processedUserIds.Add(descendant.UserId);
                        usersToProcess.Enqueue(descendant.UserId);
                        totalDescendants++;
                        
                        _logger.LogInformation("   └─ [Level {Level}] Descendant {UserId}: {Name} (Role={Role}, CreatedBy={CreatedBy}, DeptId={DeptId})", 
                            recursionLevel, descendant.UserId, descendant.FullName, descendant.Role, 
                            descendant.CreatedByUserId, descendant.DepartmentId);
                    }
                }
            }

            _logger.LogInformation("✓ STEP 8 Complete: Found {Count} descendants through recursive search", totalDescendants);

            // STEP 9: CRITICAL FIX - Get ALL users who created tasks assigned to Director's Team Leaders
            // This is the KEY FIX: Include task creators even if they're not in the Director's hierarchy
            _logger.LogInformation("✓ STEP 9: Finding ALL users who created tasks assigned to Director's Team Leaders...");
            
            var teamLeaderNames = directorCreatedUsers
                .Where(u => u.Role == DomainUserRole.TeamLeader)
                .Select(u => u.FullName)
                .ToList();
            
            if (teamLeaderNames.Any())
            {
                _logger.LogInformation("   Director has {Count} Team Leaders: [{TLNames}]", 
                    teamLeaderNames.Count, string.Join(", ", teamLeaderNames));
                
                // Get ALL tasks assigned to these Team Leaders (by name)
                var tasksAssignedToTeamLeaders = await _context.Tasks
                    .Where(t => teamLeaderNames.Contains(t.AssignedEngineer) &&
                               t.RecordStatus == RecordStatus.Active)
                    .Select(t => t.CreatedBy)
                    .Distinct()
                    .ToListAsync();
                
                var newCreatorIds = 0;
                foreach (var creatorId in tasksAssignedToTeamLeaders)
                {
                    if (allUserIds.Add(creatorId))
                    {
                        newCreatorIds++;
                        _logger.LogInformation("   └─ Added task creator {CreatorId} (has tasks assigned to Director's Team Leaders)", creatorId);
                    }
                }
                
                _logger.LogInformation("✓ STEP 9 Complete: Added {Count} task creators who assigned tasks to Team Leaders", newCreatorIds);
            }

            var distinctUserIds = allUserIds.ToList();

            _logger.LogInformation("╔═══════════════════════════════════════════════════════════════════╗");
            _logger.LogInformation("║ GetDepartmentUserIdsAsync SUMMARY");
            _logger.LogInformation("╠═══════════════════════════════════════════════════════════════════╣");
            _logger.LogInformation("║ Director {DirectorId} scope: {Count} users total", directorUserId, distinctUserIds.Count);
            _logger.LogInformation("║ - Departments: {DeptCount}", departmentIds.Count);
            _logger.LogInformation("║ - Direct department users: {DirectCount}", departmentUsers.Count);
            _logger.LogInformation("║ - Managers: {ManagerCount}", managers.Count);
            _logger.LogInformation("║ - Shop TLs: {ShopTLCount}", shopTLs.Count);
            _logger.LogInformation("║ - Customer Personnel: {CPCount}", customerPersonnel.Count);
            _logger.LogInformation("║ - Manager-created users: {MCCount}", managerCreatedUsers.Count);
            _logger.LogInformation("║ - Director-created users: {DCCount}", directorCreatedUsers.Count);
            _logger.LogInformation("║ - Recursive descendants: {RDCount}", totalDescendants);
            _logger.LogInformation("╚═══════════════════════════════════════════════════════════════════╝");
            
            // Log first 30 user IDs for debugging
            if (distinctUserIds.Count > 0)
            {
                _logger.LogInformation("📋 User IDs in scope (first 30): [{UserIds}]", 
                    string.Join(", ", distinctUserIds.Take(30)));
            }
            else
            {
                _logger.LogError("❌ CRITICAL ERROR: No users found in director's scope!");
                _logger.LogError("   This will result in NO TASKS being visible to Director {DirectorId}", directorUserId);
            }

            return distinctUserIds;
        }

        /// <summary>
        /// NEW: Get Team Leader names created by this Director (for task filtering by AssignedEngineer)
        /// Returns full names of Team Leaders that can be used to filter tasks by AssignedEngineer field
        /// This enables Directors to see ALL tasks assigned to their Team Leaders, regardless of who created them
        /// </summary>
        public async Task<List<string>> GetDirectorTeamLeaderNamesAsync(int directorUserId)
        {
            _logger.LogInformation("GetDirectorTeamLeaderNamesAsync called for Director {DirectorId}", directorUserId);
            
            var teamLeaderNames = await _context.Users
                .Where(u => u.CreatedByUserId == directorUserId && 
                           u.Role == DomainUserRole.TeamLeader && 
                           u.Status == UserStatus.Active)
                .Select(u => u.FullName)
                .ToListAsync();
            
            _logger.LogInformation("Director {DirectorId} has {Count} Team Leaders: [{TLNames}]", 
                directorUserId, teamLeaderNames.Count, string.Join(", ", teamLeaderNames));
            
            return teamLeaderNames;
        }

        /// <summary>
        /// NEW: Get Team Leaders created by this Director with their task metrics
        /// Returns detailed information about each Team Leader including their Engineers and task statistics
        /// </summary>
        public async Task<List<TeamLeaderDetailDto>> GetDirectorTeamLeadersAsync(int directorUserId)
        {
            _logger.LogInformation("Getting Team Leaders created by Director {DirectorId}", directorUserId);

            // Get all Team Leaders created by this Director
            var teamLeaders = await _context.Users
                .Include(u => u.Department)
                .Include(u => u.Shop)
                .Include(u => u.CreatedByUser)
                .Where(u => u.CreatedByUserId == directorUserId && 
                           u.Role == DomainUserRole.TeamLeader && 
                           u.Status == UserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            _logger.LogInformation("Found {Count} Team Leaders created by Director {DirectorId}", 
                teamLeaders.Count, directorUserId);

            var teamLeaderDetails = new List<TeamLeaderDetailDto>();

            foreach (var tl in teamLeaders)
            {
                // Get Engineers created by this Team Leader
                var engineers = await _context.Users
                    .Where(u => u.CreatedByUserId == tl.UserId && 
                               u.Role == DomainUserRole.Engineer && 
                               u.Status == UserStatus.Active)
                    .ToListAsync();

                // Build scope for task counting (Team Leader + their Engineers)
                var scopeUserIds = new List<int> { tl.UserId };
                scopeUserIds.AddRange(engineers.Select(e => e.UserId));

                // Get task metrics
                var activeTasks = await _context.Tasks
                    .Where(t => scopeUserIds.Contains(t.CreatedBy) && 
                               t.Status != DomainTaskStatus.Completed && 
                               t.Status != DomainTaskStatus.Rejected &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var completedTasks = await _context.CompletedTasks
                    .Where(ct => scopeUserIds.Contains(ct.CreatedBy) && 
                                ct.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var pendingTasks = await _context.Tasks
                    .Where(t => scopeUserIds.Contains(t.CreatedBy) && 
                               t.Status == DomainTaskStatus.Pending &&
                               t.RecordStatus == RecordStatus.Active)
                    .CountAsync();

                var totalTasks = activeTasks + completedTasks;
                var completionRate = totalTasks > 0 ? (double)completedTasks / totalTasks * 100 : 0;

                // Calculate average delay for completed tasks based on ActualCompletionDate vs TargetCompletionDate
                var completedTasksWithDates = await _context.CompletedTasks
                    .Where(ct => scopeUserIds.Contains(ct.CreatedBy) && 
                                ct.RecordStatus == RecordStatus.Active &&
                                ct.ActualCompletionDate.HasValue &&
                                ct.TargetCompletionDate.HasValue)
                    .Select(ct => new { ct.ActualCompletionDate, ct.TargetCompletionDate })
                    .ToListAsync();

                var avgDelayDays = 0.0;
                if (completedTasksWithDates.Any())
                {
                    var delays = completedTasksWithDates
                        .Select(ct => (ct.ActualCompletionDate!.Value - ct.TargetCompletionDate!.Value).TotalDays)
                        .Where(d => d > 0) // Only count delays (positive values)
                        .ToList();
                    avgDelayDays = delays.Any() ? delays.Average() : 0;
                }

                // Build Engineer summaries
                var engineerSummaries = new List<EngineerSummaryDto>();
                foreach (var eng in engineers)
                {
                    var engActiveTasks = await _context.Tasks
                        .Where(t => t.CreatedBy == eng.UserId && 
                                   t.Status != DomainTaskStatus.Completed && 
                                   t.Status != DomainTaskStatus.Rejected &&
                                   t.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var engCompletedTasks = await _context.CompletedTasks
                        .Where(ct => ct.CreatedBy == eng.UserId && 
                                    ct.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var engPendingTasks = await _context.Tasks
                        .Where(t => t.CreatedBy == eng.UserId && 
                                   t.Status == DomainTaskStatus.Pending &&
                                   t.RecordStatus == RecordStatus.Active)
                        .CountAsync();

                    var engTotalTasks = engActiveTasks + engCompletedTasks;
                    var engCompletionRate = engTotalTasks > 0 ? (double)engCompletedTasks / engTotalTasks * 100 : 0;

                    engineerSummaries.Add(new EngineerSummaryDto
                    {
                        UserId = eng.UserId,
                        FullName = eng.FullName,
                        Username = eng.Username,
                        Email = eng.Email,
                        ActiveTasks = engActiveTasks,
                        CompletedTasks = engCompletedTasks,
                        PendingTasks = engPendingTasks,
                        CompletionRate = engCompletionRate,
                        CurrentWorkload = engActiveTasks + engPendingTasks,
                        IsActive = eng.Status == UserStatus.Active,
                        CreatedAt = eng.CreatedAt
                    });
                }

                teamLeaderDetails.Add(new TeamLeaderDetailDto
                {
                    UserId = tl.UserId,
                    FullName = tl.FullName,
                    Username = tl.Username,
                    Email = tl.Email,
                    DepartmentId = tl.DepartmentId,
                    DepartmentName = tl.Department?.Name,
                    ShopId = tl.ShopId,
                    ShopName = tl.Shop?.Name,
                    CreatedByUserId = tl.CreatedByUserId,
                    CreatedByUserName = tl.CreatedByUser?.FullName,
                    Engineers = engineerSummaries,
                    TotalEngineers = engineers.Count,
                    ActiveTasks = activeTasks,
                    CompletedTasks = completedTasks,
                    PendingTasks = pendingTasks,
                    CompletionRate = completionRate,
                    TotalTasksAssigned = totalTasks,
                    AverageDelayDays = avgDelayDays,
                    IsActive = tl.Status == UserStatus.Active,
                    CreatedAt = tl.CreatedAt
                });

                _logger.LogInformation("Team Leader {TLId} ({TLName}): {EngCount} Engineers, {ActiveTasks} active tasks, {CompletedTasks} completed tasks", 
                    tl.UserId, tl.FullName, engineers.Count, activeTasks, completedTasks);
            }

            return teamLeaderDetails;
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