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
    /// Service for managing Team Leader-specific permissions.
    /// Allows Admin/Director to control granular access to features for each Team Leader.
    /// Mirrors DirectorPermissionService but for TeamLeader users.
    /// </summary>
    public class TlPermissionService : ITlPermissionService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<TlPermissionService> _logger;

        public TlPermissionService(
            ApplicationDbContext context,
            ILogger<TlPermissionService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<TlPermissionDto?> GetTlPermissionsAsync(int teamLeaderUserId)
        {
            var teamLeader = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == teamLeaderUserId && u.Role == DomainUserRole.TeamLeader);

            if (teamLeader == null)
            {
                _logger.LogWarning("Team Leader user {TeamLeaderId} not found", teamLeaderUserId);
                return null;
            }

            var permissions = await _context.TlPermissions
                .FirstOrDefaultAsync(tp => tp.UserId == teamLeaderUserId);

            if (permissions == null)
            {
                // Create default permissions if none exist (all enabled by default)
                _logger.LogInformation("Creating default permissions for Team Leader {TeamLeaderId}", teamLeaderUserId);
                permissions = new TlPermission
                {
                    UserId = teamLeaderUserId,
                    CanViewPerformanceMetrics = true,
                    CanViewEngineerWorkload = true,
                    CanViewAnalytics = true,
                    CanManageData = true,
                    // Granular per-card metric visibility
                    CanViewCompletionRate = true,
                    CanViewAvgDelay = true,
                    CanViewTasksCompleted = true,
                    CanViewPendingTasks = true,
                    CanManageCategories = true,
                    CanManagePriorities = true,
                    CanManageTaskTypes = true,
                    CanCreateTeamLeaders = true,
                    CanCreateManagers = true,
                    CanManageUsers = true,
                    CanViewReports = true,
                    CanExportData = true,
                    CanManageSchedules = true,
                    CanWorkloadAdjustment = true,
                    CanCreateTask = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.TlPermissions.Add(permissions);
                await _context.SaveChangesAsync();
            }

            return MapToDto(permissions, teamLeader);
        }

        public async Task<TlPermissionDto> SetTlPermissionsAsync(
            UpdateTlPermissionDto permissionDto,
            int updatedByUserId)
        {
            var teamLeader = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == permissionDto.UserId && u.Role == DomainUserRole.TeamLeader);

            if (teamLeader == null)
            {
                throw new InvalidOperationException($"Team Leader user {permissionDto.UserId} not found");
            }

            var permissions = await _context.TlPermissions
                .FirstOrDefaultAsync(tp => tp.UserId == permissionDto.UserId);

            if (permissions == null)
            {
                // Create new permissions record
                permissions = new TlPermission
                {
                    UserId = permissionDto.UserId,
                    CreatedAt = DateTime.UtcNow
                };
                _context.TlPermissions.Add(permissions);
            }

            // Update all permission fields
            permissions.CanViewPerformanceMetrics = permissionDto.CanViewPerformanceMetrics;
            permissions.CanViewEngineerWorkload = permissionDto.CanViewEngineerWorkload;
            permissions.CanViewAnalytics = permissionDto.CanViewAnalytics;
            permissions.CanManageData = permissionDto.CanManageData;
            // Granular per-card metric visibility
            permissions.CanViewCompletionRate = permissionDto.CanViewCompletionRate;
            permissions.CanViewAvgDelay = permissionDto.CanViewAvgDelay;
            permissions.CanViewTasksCompleted = permissionDto.CanViewTasksCompleted;
            permissions.CanViewPendingTasks = permissionDto.CanViewPendingTasks;
            permissions.CanManageCategories = permissionDto.CanManageCategories;
            permissions.CanManagePriorities = permissionDto.CanManagePriorities;
            permissions.CanManageTaskTypes = permissionDto.CanManageTaskTypes;
            permissions.CanCreateTeamLeaders = permissionDto.CanCreateTeamLeaders;
            permissions.CanCreateManagers = permissionDto.CanCreateManagers;
            permissions.CanManageUsers = permissionDto.CanManageUsers;
            permissions.CanViewReports = permissionDto.CanViewReports;
            permissions.CanExportData = permissionDto.CanExportData;
            permissions.CanManageSchedules = permissionDto.CanManageSchedules;
            permissions.CanWorkloadAdjustment = permissionDto.CanWorkloadAdjustment;
            permissions.CanCreateTask = permissionDto.CanCreateTask;
            permissions.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Team Leader {TeamLeaderId} permissions updated by user {UpdatedBy}",
                permissionDto.UserId, updatedByUserId);

            return (await GetTlPermissionsAsync(permissionDto.UserId))!;
        }

        public async Task<bool> HasPermissionAsync(int teamLeaderUserId, string permissionName)
        {
            var permissions = await _context.TlPermissions
                .FirstOrDefaultAsync(tp => tp.UserId == teamLeaderUserId);

            if (permissions == null)
            {
                // If no permissions record exists, create one with defaults
                var defaultPermissions = await GetTlPermissionsAsync(teamLeaderUserId);
                if (defaultPermissions == null) return false;
                permissions = await _context.TlPermissions
                    .FirstOrDefaultAsync(tp => tp.UserId == teamLeaderUserId);
            }

            if (permissions == null) return false;

            return permissionName.ToLower() switch
            {
                "can_view_performance_metrics" => permissions.CanViewPerformanceMetrics,
                "can_view_engineer_workload" => permissions.CanViewEngineerWorkload,
                "can_view_analytics" => permissions.CanViewAnalytics,
                "can_manage_data" => permissions.CanManageData,
                // Granular per-card metric visibility
                "can_view_completion_rate" => permissions.CanViewCompletionRate,
                "can_view_avg_delay" => permissions.CanViewAvgDelay,
                "can_view_tasks_completed" => permissions.CanViewTasksCompleted,
                "can_view_pending_tasks" => permissions.CanViewPendingTasks,
                "can_manage_categories" => permissions.CanManageCategories,
                "can_manage_priorities" => permissions.CanManagePriorities,
                "can_manage_task_types" => permissions.CanManageTaskTypes,
                "can_create_team_leaders" => permissions.CanCreateTeamLeaders,
                "can_create_managers" => permissions.CanCreateManagers,
                "can_manage_users" => permissions.CanManageUsers,
                "can_view_reports" => permissions.CanViewReports,
                "can_export_data" => permissions.CanExportData,
                "can_manage_schedules" => permissions.CanManageSchedules,
                "can_workload_adjustment" => permissions.CanWorkloadAdjustment,
                "can_create_task" => permissions.CanCreateTask,
                _ => false
            };
        }

        public async Task<List<TeamLeaderWithPermissionsDto>> GetAllTeamLeadersWithPermissionsAsync()
        {
            var teamLeaders = await _context.Users
                .Where(u => u.Role == DomainUserRole.TeamLeader && u.Status == DomainUserStatus.Active)
                .Include(u => u.Shop)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            var result = new List<TeamLeaderWithPermissionsDto>();

            foreach (var tl in teamLeaders)
            {
                var engineersCount = await _context.Users
                    .Where(u => u.SupervisorId == tl.UserId &&
                               u.Role == DomainUserRole.Engineer &&
                               u.Status == DomainUserStatus.Active)
                    .CountAsync();

                var permissions = await GetTlPermissionsAsync(tl.UserId);

                result.Add(new TeamLeaderWithPermissionsDto
                {
                    UserId = tl.UserId,
                    FullName = tl.FullName,
                    Username = tl.Username,
                    Email = tl.Email,
                    ShopName = tl.Shop?.Name,
                    EngineersCount = engineersCount,
                    IsActive = tl.Status == DomainUserStatus.Active,
                    CreatedAt = tl.CreatedAt,
                    Permissions = permissions
                });
            }

            return result;
        }

        public async Task<TlPermissionDto> ResetToDefaultPermissionsAsync(int teamLeaderUserId, int updatedByUserId)
        {
            var teamLeader = await _context.Users
                .FirstOrDefaultAsync(u => u.UserId == teamLeaderUserId && u.Role == DomainUserRole.TeamLeader);

            if (teamLeader == null)
            {
                throw new InvalidOperationException($"Team Leader user {teamLeaderUserId} not found");
            }

            var defaultDto = new UpdateTlPermissionDto
            {
                UserId = teamLeaderUserId,
                CanViewPerformanceMetrics = true,
                CanViewEngineerWorkload = true,
                CanViewAnalytics = true,
                CanManageData = true,
                // Granular per-card metric visibility
                CanViewCompletionRate = true,
                CanViewAvgDelay = true,
                CanViewTasksCompleted = true,
                CanViewPendingTasks = true,
                CanManageCategories = true,
                CanManagePriorities = true,
                CanManageTaskTypes = true,
                CanCreateTeamLeaders = true,
                CanCreateManagers = true,
                CanManageUsers = true,
                CanViewReports = true,
                CanExportData = true,
                CanManageSchedules = true,
                CanWorkloadAdjustment = true,
                CanCreateTask = true
            };

            return await SetTlPermissionsAsync(defaultDto, updatedByUserId);
        }

        // ─── Private helpers ─────────────────────────────────────────────

        private static TlPermissionDto MapToDto(TlPermission permissions, User teamLeader)
        {
            return new TlPermissionDto
            {
                TlPermissionId = permissions.TlPermissionId,
                UserId = permissions.UserId,
                TeamLeaderName = teamLeader.FullName,
                TeamLeaderEmail = teamLeader.Email,
                CanViewPerformanceMetrics = permissions.CanViewPerformanceMetrics,
                CanViewEngineerWorkload = permissions.CanViewEngineerWorkload,
                CanViewAnalytics = permissions.CanViewAnalytics,
                CanManageData = permissions.CanManageData,
                // Granular per-card metric visibility
                CanViewCompletionRate = permissions.CanViewCompletionRate,
                CanViewAvgDelay = permissions.CanViewAvgDelay,
                CanViewTasksCompleted = permissions.CanViewTasksCompleted,
                CanViewPendingTasks = permissions.CanViewPendingTasks,
                CanManageCategories = permissions.CanManageCategories,
                CanManagePriorities = permissions.CanManagePriorities,
                CanManageTaskTypes = permissions.CanManageTaskTypes,
                CanCreateTeamLeaders = permissions.CanCreateTeamLeaders,
                CanCreateManagers = permissions.CanCreateManagers,
                CanManageUsers = permissions.CanManageUsers,
                CanViewReports = permissions.CanViewReports,
                CanExportData = permissions.CanExportData,
                CanManageSchedules = permissions.CanManageSchedules,
                CanWorkloadAdjustment = permissions.CanWorkloadAdjustment,
                CanCreateTask = permissions.CanCreateTask,
                CreatedAt = permissions.CreatedAt,
                UpdatedAt = permissions.UpdatedAt
            };
        }
    }
}