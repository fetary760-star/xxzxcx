using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Models;
using CMT.Domain.Data;
using Microsoft.EntityFrameworkCore;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainTaskStatus = CMT.Domain.Enums.TaskStatus;

namespace CMT.Application.Services
{
    public class DepartmentService : IDepartmentService
    {
        private readonly ApplicationDbContext _context;
        private readonly IUserService _userService;

        public DepartmentService(ApplicationDbContext context, IUserService userService)
        {
            _context = context;
            _userService = userService;
        }

        public async Task<DepartmentDto?> GetDepartmentByIdAsync(int departmentId)
        {
            var department = await _context.Departments
                .Include(d => d.Director)
                .Include(d => d.Users)
                .FirstOrDefaultAsync(d => d.DepartmentId == departmentId);

            if (department == null) return null;

            return await MapToDepartmentDtoAsync(department);
        }

        public async Task<List<DepartmentDto>> GetAllDepartmentsAsync()
        {
            var departments = await _context.Departments
                .Include(d => d.Director)
                .Include(d => d.Users)
                .Where(d => d.IsActive)
                .OrderBy(d => d.Name)
                .ToListAsync();

            var departmentDtos = new List<DepartmentDto>();
            foreach (var dept in departments)
            {
                departmentDtos.Add(await MapToDepartmentDtoAsync(dept));
            }
            return departmentDtos;
        }

        // CRITICAL: Directors can only see their own departments
        public async Task<List<DepartmentDto>> GetDepartmentsByDirectorAsync(int directorId)
        {
            var departments = await _context.Departments
                .Include(d => d.Director)
                .Include(d => d.Users)
                .Where(d => d.DirectorId == directorId && d.IsActive)
                .OrderBy(d => d.Name)
                .ToListAsync();

            var departmentDtos = new List<DepartmentDto>();
            foreach (var dept in departments)
            {
                departmentDtos.Add(await MapToDepartmentDtoAsync(dept));
            }
            return departmentDtos;
        }

        // CRITICAL: Director dashboard with department isolation
        public async Task<DirectorDashboardDto> GetDirectorDashboardAsync(int directorId)
        {
            var director = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == directorId && u.Role == DomainUserRole.Director);

            if (director == null)
            {
                return new DirectorDashboardDto
                {
                    DirectorUserId = directorId,
                    DirectorName = "Unknown"
                };
            }

            // CRITICAL: Only get departments created by THIS director
            var departments = await _context.Departments
                .Include(d => d.Users)
                .Where(d => d.DirectorId == directorId && d.IsActive)
                .OrderBy(d => d.Name)
                .ToListAsync();

            var departmentSummaries = new List<DepartmentSummaryDto>();
            int totalManagers = 0;
            int totalShopTLs = 0;
            int totalTeamLeaders = 0;
            int totalEngineers = 0;
            int totalUsers = 0;
            int totalActiveTasks = 0;
            int totalCompletedTasks = 0;
            int totalPendingTasks = 0;

            foreach (var dept in departments)
            {
                var hierarchy = await GetDepartmentHierarchyAsync(dept.DepartmentId);
                
                var managers = dept.Users
                    .Where(u => u.Role == DomainUserRole.Manager && u.Status == UserStatus.Active)
                    .Select(u => new ManagerSummaryDto
                    {
                        UserId = u.UserId,
                        FullName = u.FullName,
                        Email = u.Email,
                        IsActive = u.Status == UserStatus.Active
                    })
                    .ToList();

                var summary = new DepartmentSummaryDto
                {
                    DepartmentId = hierarchy.DepartmentId,
                    DepartmentName = hierarchy.Name,
                    Description = hierarchy.Description,
                    Managers = managers,
                    TotalManagers = managers.Count,
                    TotalUsers = hierarchy.TotalUsers,
                    TotalShopTeamLeaders = hierarchy.ShopTeamLeaders.Count,
                    ActiveTasks = hierarchy.TotalActiveTasks,
                    CompletedTasks = hierarchy.TotalCompletedTasks,
                    IsActive = hierarchy.IsActive,
                    CreatedAt = dept.CreatedAt
                };
                departmentSummaries.Add(summary);

                totalManagers += managers.Count;
                totalShopTLs += hierarchy.ShopTeamLeaders.Count;
                totalTeamLeaders += hierarchy.TeamLeaders.Count;
                totalEngineers += hierarchy.Engineers.Count;
                totalUsers += hierarchy.TotalUsers;
                totalActiveTasks += hierarchy.TotalActiveTasks;
                totalCompletedTasks += hierarchy.TotalCompletedTasks;
                totalPendingTasks += hierarchy.TotalPendingTasks;
            }

            // CRITICAL: Get all user IDs under THIS director's departments only
            var allDepartmentUserIds = new List<int>();
            foreach (var dept in departments)
            {
                var deptUserIds = await _context.Users
                    .Where(u => u.DepartmentId == dept.DepartmentId && u.Status == UserStatus.Active)
                    .Select(u => u.UserId)
                    .ToListAsync();
                allDepartmentUserIds.AddRange(deptUserIds);
            }

            // CRITICAL: Get recent tasks ONLY from this director's department users
            var recentTasks = await _context.Tasks
                .Include(t => t.Creator)
                .Include(t => t.Category)
                .Include(t => t.Priority)
                .Where(t => allDepartmentUserIds.Contains(t.CreatedBy) && t.RecordStatus == RecordStatus.Active)
                .OrderByDescending(t => t.CreatedAt)
                .Take(15)
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

            var totalTasks = totalActiveTasks + totalCompletedTasks;
            var overallCompletionRate = totalTasks > 0 ? (double)totalCompletedTasks / totalTasks * 100 : 0;

            return new DirectorDashboardDto
            {
                DirectorUserId = directorId,
                DirectorName = director.FullName,
                Departments = departmentSummaries,
                TotalDepartments = departments.Count,
                TotalManagers = totalManagers,
                TotalShopTeamLeaders = totalShopTLs,
                TotalTeamLeaders = totalTeamLeaders,
                TotalEngineers = totalEngineers,
                TotalUsers = totalUsers,
                TotalActiveTasks = totalActiveTasks,
                TotalCompletedTasks = totalCompletedTasks,
                TotalPendingTasks = totalPendingTasks,
                OverallCompletionRate = overallCompletionRate,
                RecentTasks = recentTasks
            };
        }

        public async Task<DepartmentWithHierarchyDto> GetDepartmentHierarchyAsync(int departmentId)
        {
            var department = await _context.Departments
                .Include(d => d.Users)
                .FirstOrDefaultAsync(d => d.DepartmentId == departmentId);

            if (department == null)
            {
                throw new InvalidOperationException($"Department with ID {departmentId} not found");
            }

            // Get all users in this department
            var departmentUsers = await _context.Users
                .Include(u => u.Shop)
                .Include(u => u.Manager)
                .Where(u => u.DepartmentId == departmentId && u.Status == UserStatus.Active)
                .ToListAsync();

            var managers = departmentUsers
                .Where(u => u.Role == DomainUserRole.Manager)
                .Select(u => new ManagerSummaryDto
                {
                    UserId = u.UserId,
                    FullName = u.FullName,
                    Email = u.Email,
                    IsActive = u.Status == UserStatus.Active
                })
                .ToList();

            // Categorize users by role
            var shopTeamLeaders = departmentUsers.Where(u => u.Role == DomainUserRole.ShopTL).ToList();
            var teamLeaders = departmentUsers.Where(u => u.Role == DomainUserRole.TeamLeader).ToList();
            var engineers = departmentUsers.Where(u => u.Role == DomainUserRole.Engineer).ToList();

            // Build Shop Team Leader hierarchy with their teams
            var shopTLWithTeams = new List<ShopTeamLeaderWithTeamDto>();
            foreach (var shopTL in shopTeamLeaders)
            {
                var teamMembers = await _userService.GetUsersCreatedByShopTLAsync(shopTL.UserId);
                var metrics = await CalculateUserMetricsAsync(shopTL.UserId);

                shopTLWithTeams.Add(new ShopTeamLeaderWithTeamDto
                {
                    UserId = shopTL.UserId,
                    FullName = shopTL.FullName,
                    Username = shopTL.Username,
                    Email = shopTL.Email,
                    ShopId = shopTL.ShopId,
                    ShopName = shopTL.Shop?.Name,
                    TeamMembers = teamMembers,
                    TotalTeamMembers = teamMembers.Count,
                    CompletedTasks = metrics.CompletedTasks,
                    ActiveTasks = metrics.ActiveTasks,
                    PendingTasks = metrics.PendingTasks,
                    CompletionRate = metrics.CompletionRate
                });
            }

            // Convert to DTOs
            var teamLeaderDtos = new List<UserDto>();
            foreach (var tl in teamLeaders)
            {
                var dto = await _userService.GetUserByIdAsync(tl.UserId);
                if (dto != null) teamLeaderDtos.Add(dto);
            }

            var engineerDtos = new List<UserDto>();
            foreach (var eng in engineers)
            {
                var dto = await _userService.GetUserByIdAsync(eng.UserId);
                if (dto != null) engineerDtos.Add(dto);
            }

            // Calculate department statistics
            var allDepartmentUserIds = departmentUsers.Select(u => u.UserId).ToList();
            var activeTasks = await _context.Tasks
                .Where(t => allDepartmentUserIds.Contains(t.CreatedBy) && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var completedTasks = await _context.CompletedTasks
                .Where(ct => allDepartmentUserIds.Contains(ct.CreatedBy) && ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var pendingTasks = await _context.Tasks
                .Where(t => allDepartmentUserIds.Contains(t.CreatedBy) && 
                           t.Status == DomainTaskStatus.Pending &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var totalTasks = activeTasks + completedTasks;
            var completionRate = totalTasks > 0 ? (double)completedTasks / totalTasks * 100 : 0;

            return new DepartmentWithHierarchyDto
            {
                DepartmentId = department.DepartmentId,
                Name = department.Name,
                Description = department.Description,
                IsActive = department.IsActive,
                Managers = managers,
                ShopTeamLeaders = shopTLWithTeams,
                TeamLeaders = teamLeaderDtos,
                Engineers = engineerDtos,
                TotalUsers = departmentUsers.Count,
                TotalActiveTasks = activeTasks,
                TotalCompletedTasks = completedTasks,
                TotalPendingTasks = pendingTasks,
                CompletionRate = completionRate
            };
        }

        public async Task<DepartmentDto> CreateDepartmentAsync(CreateDepartmentDto createDepartmentDto, int createdByDirectorId)
        {
            // Validate director
            var director = await _context.Users.FindAsync(createdByDirectorId);
            if (director == null || director.Role != DomainUserRole.Director)
            {
                throw new InvalidOperationException("Only Directors can create departments");
            }

            // Validate managers if provided
            if (createDepartmentDto.ManagerIds != null && createDepartmentDto.ManagerIds.Any())
            {
                foreach (var managerId in createDepartmentDto.ManagerIds)
                {
                    var manager = await _context.Users.FindAsync(managerId);
                    if (manager == null || manager.Role != DomainUserRole.Manager)
                    {
                        throw new InvalidOperationException($"Invalid manager assignment - User {managerId} must have Manager role");
                    }
                    if (manager.Status != UserStatus.Active)
                    {
                        throw new InvalidOperationException($"Manager {managerId} must be active");
                    }
                }
            }

            var department = new Department
            {
                Name = createDepartmentDto.Name.Trim(),
                Description = createDepartmentDto.Description?.Trim(),
                DirectorId = createdByDirectorId,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Departments.Add(department);
            await _context.SaveChangesAsync();

            // Assign managers to department by setting their DepartmentId
            if (createDepartmentDto.ManagerIds != null && createDepartmentDto.ManagerIds.Any())
            {
                foreach (var managerId in createDepartmentDto.ManagerIds)
                {
                    var manager = await _context.Users.FindAsync(managerId);
                    if (manager != null)
                    {
                        manager.DepartmentId = department.DepartmentId;
                        manager.UpdatedAt = DateTime.UtcNow;
                    }
                }
                await _context.SaveChangesAsync();
            }

            return await GetDepartmentByIdAsync(department.DepartmentId) 
                ?? throw new InvalidOperationException("Failed to create department");
        }

        public async Task<DepartmentDto> UpdateDepartmentAsync(int departmentId, UpdateDepartmentDto updateDepartmentDto, int updatedByUserId)
        {
            var department = await _context.Departments
                .Include(d => d.Users)
                .FirstOrDefaultAsync(d => d.DepartmentId == departmentId);
                
            if (department == null)
            {
                throw new InvalidOperationException("Department not found");
            }

            if (!string.IsNullOrEmpty(updateDepartmentDto.Name))
            {
                department.Name = updateDepartmentDto.Name.Trim();
            }

            if (updateDepartmentDto.Description != null)
            {
                department.Description = updateDepartmentDto.Description.Trim();
            }

            // Handle manager assignments
            if (updateDepartmentDto.ManagerIds != null)
            {
                // Validate all manager IDs
                foreach (var managerId in updateDepartmentDto.ManagerIds)
                {
                    var manager = await _context.Users.FindAsync(managerId);
                    if (manager == null || manager.Role != DomainUserRole.Manager)
                    {
                        throw new InvalidOperationException($"Invalid manager assignment - User {managerId} must have Manager role");
                    }
                    if (manager.Status != UserStatus.Active)
                    {
                        throw new InvalidOperationException($"Manager {managerId} must be active");
                    }
                }

                // Remove existing managers from this department
                var existingManagers = department.Users
                    .Where(u => u.Role == DomainUserRole.Manager)
                    .ToList();
                    
                foreach (var existingManager in existingManagers)
                {
                    existingManager.DepartmentId = null;
                    existingManager.UpdatedAt = DateTime.UtcNow;
                }

                // Assign new managers
                foreach (var managerId in updateDepartmentDto.ManagerIds)
                {
                    var manager = await _context.Users.FindAsync(managerId);
                    if (manager != null)
                    {
                        manager.DepartmentId = departmentId;
                        manager.UpdatedAt = DateTime.UtcNow;
                    }
                }
            }

            if (updateDepartmentDto.IsActive.HasValue)
            {
                department.IsActive = updateDepartmentDto.IsActive.Value;
            }

            department.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return await GetDepartmentByIdAsync(departmentId) 
                ?? throw new InvalidOperationException("Failed to update department");
        }

        public async Task<bool> DeleteDepartmentAsync(int departmentId, int deletedByUserId)
        {
            var department = await _context.Departments.FindAsync(departmentId);
            if (department == null) return false;

            // Check if department has users
            var hasUsers = await _context.Users.AnyAsync(u => u.DepartmentId == departmentId && u.Status == UserStatus.Active);
            if (hasUsers)
            {
                throw new InvalidOperationException("Cannot delete department with active users. Please reassign users first.");
            }

            department.IsActive = false;
            department.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return true;
        }

        public async Task<bool> AssignManagersToDepartmentAsync(int departmentId, List<int> managerIds, int assignedByUserId)
        {
            var department = await _context.Departments
                .Include(d => d.Users)
                .FirstOrDefaultAsync(d => d.DepartmentId == departmentId);
                
            if (department == null)
            {
                throw new InvalidOperationException("Department not found");
            }

            // Validate all manager IDs
            foreach (var managerId in managerIds)
            {
                var manager = await _context.Users.FindAsync(managerId);
                if (manager == null || manager.Role != DomainUserRole.Manager)
                {
                    throw new InvalidOperationException($"Invalid manager - User {managerId} must have Manager role");
                }
                if (manager.Status != UserStatus.Active)
                {
                    throw new InvalidOperationException($"Manager {managerId} must be active");
                }
            }

            // Remove existing managers from this department
            var existingManagers = department.Users
                .Where(u => u.Role == DomainUserRole.Manager)
                .ToList();
                
            foreach (var existingManager in existingManagers)
            {
                existingManager.DepartmentId = null;
                existingManager.UpdatedAt = DateTime.UtcNow;
            }

            // Assign new managers
            foreach (var managerId in managerIds)
            {
                var manager = await _context.Users.FindAsync(managerId);
                if (manager != null)
                {
                    manager.DepartmentId = departmentId;
                    manager.UpdatedAt = DateTime.UtcNow;
                }
            }

            department.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            
            return true;
        }

        public async Task<bool> AssignManagerToDepartmentAsync(int departmentId, int managerId, int assignedByUserId)
        {
            return await AssignManagersToDepartmentAsync(departmentId, new List<int> { managerId }, assignedByUserId);
        }

        private async Task<DepartmentDto> MapToDepartmentDtoAsync(Department department)
        {
            var departmentUserIds = await _context.Users
                .Where(u => u.DepartmentId == department.DepartmentId && u.Status == UserStatus.Active)
                .Select(u => u.UserId)
                .ToListAsync();

            var managers = await _context.Users
                .Where(u => u.DepartmentId == department.DepartmentId && 
                           u.Role == DomainUserRole.Manager && 
                           u.Status == UserStatus.Active)
                .Select(u => new ManagerSummaryDto
                {
                    UserId = u.UserId,
                    FullName = u.FullName,
                    Email = u.Email,
                    IsActive = u.Status == UserStatus.Active
                })
                .ToListAsync();

            var shopTLCount = await _context.Users
                .Where(u => u.DepartmentId == department.DepartmentId && 
                           u.Role == DomainUserRole.ShopTL && 
                           u.Status == UserStatus.Active)
                .CountAsync();

            var teamLeaderCount = await _context.Users
                .Where(u => u.DepartmentId == department.DepartmentId && 
                           u.Role == DomainUserRole.TeamLeader && 
                           u.Status == UserStatus.Active)
                .CountAsync();

            var engineerCount = await _context.Users
                .Where(u => u.DepartmentId == department.DepartmentId && 
                           u.Role == DomainUserRole.Engineer && 
                           u.Status == UserStatus.Active)
                .CountAsync();

            var activeTasks = await _context.Tasks
                .Where(t => departmentUserIds.Contains(t.CreatedBy) && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var completedTasks = await _context.CompletedTasks
                .Where(ct => departmentUserIds.Contains(ct.CreatedBy) && ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            return new DepartmentDto
            {
                DepartmentId = department.DepartmentId,
                Name = department.Name,
                Description = department.Description,
                DirectorId = department.DirectorId,
                DirectorName = department.Director.FullName,
                Managers = managers,
                IsActive = department.IsActive,
                CreatedAt = department.CreatedAt,
                UpdatedAt = department.UpdatedAt,
                TotalUsers = departmentUserIds.Count,
                TotalShopTeamLeaders = shopTLCount,
                TotalTeamLeaders = teamLeaderCount,
                TotalEngineers = engineerCount,
                TotalActiveTasks = activeTasks,
                TotalCompletedTasks = completedTasks
            };
        }

        private async Task<(int CompletedTasks, int ActiveTasks, int PendingTasks, double CompletionRate)> CalculateUserMetricsAsync(int userId)
        {
            var createdUserIds = await _context.Users
                .Where(u => u.CreatedByUserId == userId && u.Status == UserStatus.Active)
                .Select(u => u.UserId)
                .ToListAsync();
            createdUserIds.Add(userId);

            var completedTasks = await _context.CompletedTasks
                .Where(ct => createdUserIds.Contains(ct.CreatedBy) && ct.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var activeTasks = await _context.Tasks
                .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                           t.Status != DomainTaskStatus.Completed && 
                           t.Status != DomainTaskStatus.Rejected &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var pendingTasks = await _context.Tasks
                .Where(t => createdUserIds.Contains(t.CreatedBy) && 
                           t.Status == DomainTaskStatus.Pending &&
                           t.RecordStatus == RecordStatus.Active)
                .CountAsync();

            var totalTasks = completedTasks + activeTasks;
            var completionRate = totalTasks > 0 ? (double)completedTasks / totalTasks * 100 : 0;

            return (completedTasks, activeTasks, pendingTasks, completionRate);
        }
    }
}