using CMT.Application.DTOs;
using CMT.Application.Interfaces;
using CMT.Domain.Data;
using CMT.Domain.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using DomainUserRole = CMT.Domain.Models.UserRole;
using DomainUserStatus = CMT.Domain.Models.UserStatus;

namespace CMT.Application.Services
{
    /// <summary>
    /// Service for managing Director-specific permissions
    /// Allows Admin to control granular access to features for each Director
    /// </summary>
    public class DirectorPermissionService : IDirectorPermissionService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<DirectorPermissionService> _logger;

        public DirectorPermissionService(
            ApplicationDbContext context,
            ILogger<DirectorPermissionService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<DirectorPermissionDto?> GetDirectorPermissionsAsync(int directorUserId)
        {
            var director = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == directorUserId && u.Role == DomainUserRole.Director);

            if (director == null)
            {
                _logger.LogWarning("Director user {DirectorId} not found", directorUserId);
                return null;
            }

            var permissions = await _context.DirectorPermissions
                .FirstOrDefaultAsync(dp => dp.UserId == directorUserId);

            if (permissions == null)
            {
                // Create default permissions if none exist
                _logger.LogInformation("Creating default permissions for Director {DirectorId}", directorUserId);
                permissions = new DirectorPermission
                {
                    UserId = directorUserId,
                    CanViewWorkloadDashboard = true,
                    CanViewPerformanceMetrics = true,
                    CanViewAnalytics = true,
                    CanViewEngineerWorkload = true,
                    CanManageCategories = true,
                    CanManagePriorities = true,
                    CanManageTaskTypes = true,
                    CanCreateTeamLeader = director.CanCreateTeamLeader, // Inherit from User.CanCreateTeamLeader
                    CanCreateManager = true,
                    CanManageUsers = true,
                    CanManageDepartments = true,
                    CanManageShops = true,
                    CanViewReports = true,
                    CanExportData = true,
                    CanManageSchedules = true,
                    CanViewPendingTLApprovals = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.DirectorPermissions.Add(permissions);
                await _context.SaveChangesAsync();
            }

            return new DirectorPermissionDto
            {
                DirectorPermissionId = permissions.DirectorPermissionId,
                UserId = permissions.UserId,
                DirectorName = director.FullName,
                DirectorEmail = director.Email,
                CanViewWorkloadDashboard = permissions.CanViewWorkloadDashboard,
                CanViewPerformanceMetrics = permissions.CanViewPerformanceMetrics,
                CanViewAnalytics = permissions.CanViewAnalytics,
                CanViewEngineerWorkload = permissions.CanViewEngineerWorkload,
                CanManageCategories = permissions.CanManageCategories,
                CanManagePriorities = permissions.CanManagePriorities,
                CanManageTaskTypes = permissions.CanManageTaskTypes,
                CanCreateTeamLeader = permissions.CanCreateTeamLeader,
                CanCreateManager = permissions.CanCreateManager,
                CanManageUsers = permissions.CanManageUsers,
                CanManageDepartments = permissions.CanManageDepartments,
                CanManageShops = permissions.CanManageShops,
                CanViewReports = permissions.CanViewReports,
                CanExportData = permissions.CanExportData,
                CanManageSchedules = permissions.CanManageSchedules,
                CanViewPendingTLApprovals = permissions.CanViewPendingTLApprovals,
                CreatedAt = permissions.CreatedAt,
                UpdatedAt = permissions.UpdatedAt
            };
        }

        public async Task<DirectorPermissionDto> SetDirectorPermissionsAsync(
            UpdateDirectorPermissionDto permissionDto, 
            int updatedByUserId)
        {
            var director = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == permissionDto.UserId && u.Role == DomainUserRole.Director);

            if (director == null)
            {
                throw new InvalidOperationException($"Director user {permissionDto.UserId} not found");
            }

            var permissions = await _context.DirectorPermissions
                .FirstOrDefaultAsync(dp => dp.UserId == permissionDto.UserId);

            if (permissions == null)
            {
                // Create new permissions
                permissions = new DirectorPermission
                {
                    UserId = permissionDto.UserId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.DirectorPermissions.Add(permissions);
            }

            // Update all permission fields
            permissions.CanViewWorkloadDashboard = permissionDto.CanViewWorkloadDashboard;
            permissions.CanViewPerformanceMetrics = permissionDto.CanViewPerformanceMetrics;
            permissions.CanViewAnalytics = permissionDto.CanViewAnalytics;
            permissions.CanViewEngineerWorkload = permissionDto.CanViewEngineerWorkload;
            permissions.CanManageCategories = permissionDto.CanManageCategories;
            permissions.CanManagePriorities = permissionDto.CanManagePriorities;
            permissions.CanManageTaskTypes = permissionDto.CanManageTaskTypes;
            permissions.CanCreateTeamLeader = permissionDto.CanCreateTeamLeader;
            permissions.CanCreateManager = permissionDto.CanCreateManager;
            permissions.CanManageUsers = permissionDto.CanManageUsers;
            permissions.CanManageDepartments = permissionDto.CanManageDepartments;
            permissions.CanManageShops = permissionDto.CanManageShops;
            permissions.CanViewReports = permissionDto.CanViewReports;
            permissions.CanExportData = permissionDto.CanExportData;
            permissions.CanManageSchedules = permissionDto.CanManageSchedules;
            permissions.CanViewPendingTLApprovals = permissionDto.CanViewPendingTLApprovals;
            permissions.UpdatedAt = DateTime.UtcNow;

            // Also update User.CanCreateTeamLeader for backward compatibility
            director.CanCreateTeamLeader = permissionDto.CanCreateTeamLeader;
            director.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Director {DirectorId} permissions updated by user {UpdatedBy}", 
                permissionDto.UserId, updatedByUserId);

            return (await GetDirectorPermissionsAsync(permissionDto.UserId))!;
        }

        public async Task<bool> HasPermissionAsync(int directorUserId, string permissionName)
        {
            var permissions = await _context.DirectorPermissions
                .FirstOrDefaultAsync(dp => dp.UserId == directorUserId);

            if (permissions == null)
            {
                // If no permissions record exists, create one with defaults
                var defaultPermissions = await GetDirectorPermissionsAsync(directorUserId);
                if (defaultPermissions == null) return false;
                permissions = await _context.DirectorPermissions
                    .FirstOrDefaultAsync(dp => dp.UserId == directorUserId);
            }

            if (permissions == null) return false;

            return permissionName.ToLower() switch
            {
                "can_view_workload_dashboard" => permissions.CanViewWorkloadDashboard,
                "can_view_performance_metrics" => permissions.CanViewPerformanceMetrics,
                "can_view_analytics" => permissions.CanViewAnalytics,
                "can_view_engineer_workload" => permissions.CanViewEngineerWorkload,
                "can_manage_categories" => permissions.CanManageCategories,
                "can_manage_priorities" => permissions.CanManagePriorities,
                "can_manage_task_types" => permissions.CanManageTaskTypes,
                "can_create_team_leader" => permissions.CanCreateTeamLeader,
                "can_create_manager" => permissions.CanCreateManager,
                "can_manage_users" => permissions.CanManageUsers,
                "can_manage_departments" => permissions.CanManageDepartments,
                "can_manage_shops" => permissions.CanManageShops,
                "can_view_reports" => permissions.CanViewReports,
                "can_export_data" => permissions.CanExportData,
                "can_manage_schedules" => permissions.CanManageSchedules,
                "can_view_pending_tl_approvals" => permissions.CanViewPendingTLApprovals,
                _ => false
            };
        }

        public async Task<List<DirectorWithPermissionsDto>> GetAllDirectorsWithPermissionsAsync()
        {
            var directors = await _context.Users
                .Where(u => u.Role == DomainUserRole.Director && u.Status == DomainUserStatus.Active)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var result = new List<DirectorWithPermissionsDto>();

            foreach (var director in directors)
            {
                var departmentCount = await _context.Departments
                    .Where(d => d.DirectorId == director.UserId && d.IsActive)
                    .CountAsync();

                var managerCount = await _context.Users
                    .Where(u => u.DepartmentId.HasValue &&
                               _context.Departments.Any(d => d.DirectorId == director.UserId && 
                                                            d.DepartmentId == u.DepartmentId.Value) &&
                               u.Role == DomainUserRole.Manager &&
                               u.Status == DomainUserStatus.Active)
                    .CountAsync();

                var totalTeamMembers = await _context.Users
                    .Where(u => u.DepartmentId.HasValue &&
                               _context.Departments.Any(d => d.DirectorId == director.UserId && 
                                                            d.DepartmentId == u.DepartmentId.Value) &&
                               u.Status == DomainUserStatus.Active)
                    .CountAsync();

                var permissions = await GetDirectorPermissionsAsync(director.UserId);

                result.Add(new DirectorWithPermissionsDto
                {
                    UserId = director.UserId,
                    FullName = director.FullName,
                    Username = director.Username,
                    Email = director.Email,
                    DepartmentCount = departmentCount,
                    ManagerCount = managerCount,
                    TotalTeamMembers = totalTeamMembers,
                    IsActive = director.Status == DomainUserStatus.Active,
                    CreatedAt = director.CreatedAt,
                    Permissions = permissions
                });
            }

            return result;
        }

        public async Task<DirectorPermissionDto> ResetToDefaultPermissionsAsync(int directorUserId, int updatedByUserId)
        {
            var director = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == directorUserId && u.Role == DomainUserRole.Director);

            if (director == null)
            {
                throw new InvalidOperationException($"Director user {directorUserId} not found");
            }

            var defaultDto = new UpdateDirectorPermissionDto
            {
                UserId = directorUserId,
                CanViewWorkloadDashboard = true,
                CanViewPerformanceMetrics = true,
                CanViewAnalytics = true,
                CanViewEngineerWorkload = true,
                CanManageCategories = true,
                CanManagePriorities = true,
                CanManageTaskTypes = true,
                CanCreateTeamLeader = false, // Default to false for security
                CanCreateManager = true,
                CanManageUsers = true,
                CanManageDepartments = true,
                CanManageShops = true,
                CanViewReports = true,
                CanExportData = true,
                CanManageSchedules = true,
                CanViewPendingTLApprovals = true
            };

            return await SetDirectorPermissionsAsync(defaultDto, updatedByUserId);
        }
    }
}