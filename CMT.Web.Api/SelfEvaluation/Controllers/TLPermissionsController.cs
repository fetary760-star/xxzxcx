using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.Shared;
using RecordStatus = CMT.Domain.Models.Shared.RecordStatus;

namespace CMT.Web.Api.SelfEvaluation.Controllers
{
    /// <summary>
    /// Team Leader Permissions Controller
    /// 
    /// Returns and manages the permissions for users based on their role
    /// and any additional/revoked permissions configured.
    /// 
    /// Permissions are computed as:
    /// 1. Base permissions from role (role defaults)
    /// 2. + Additional permissions (granted beyond defaults)
    /// 3. - Revoked permissions (removed from defaults)
    /// 
    /// Endpoints:
    /// - GET  /api/tl-permissions/{userId}       → Get computed permissions for a user
    /// - GET  /api/tl-permissions/me             → Get computed permissions for current user
    /// - PUT  /api/tl-permissions/{userId}       → Update permissions for a user
    /// - GET  /api/tl-permissions/role/{role}    → Get default permissions for a role
    /// - GET  /api/tl-permissions/shop/{shopId}  → Get all users' permissions in a shop
    /// </summary>
    [ApiController]
    [Route("api/self-evaluation/tl-permissions")]
    [Authorize]
    public class TLPermissionsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public TLPermissionsController(ApplicationDbContext context)
        {
            _context = context;
        }

        #region Helper Methods

        /// <summary>
        /// Gets the current authenticated user's ID from JWT claims.
        /// </summary>
        private long GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)
                ?? User.FindFirst("sub");
            return long.TryParse(userIdClaim?.Value, out var id) ? id : 0;
        }

        /// <summary>
        /// Gets the current authenticated user's role from JWT claims.
        /// </summary>
        private string? GetCurrentUserRole()
        {
            return User.FindFirst("role")?.Value
                ?? User.FindFirst(ClaimTypes.Role)?.Value;
        }

        /// <summary>
        /// Determines if the current user can manage permissions for the target user.
        /// </summary>
        private static bool CanManagePermissions(string? currentRole, string? targetRole)
        {
            if (string.IsNullOrEmpty(currentRole)) return false;

            return currentRole.ToLower() switch
            {
                "admin" => true,
                "director" => targetRole?.ToLower() is "manager" or "shopmanager" or "teamleader"
                    or "engineer" or "technician" or "certifyingstaff",
                "manager" => targetRole?.ToLower() is "shopmanager" or "teamleader"
                    or "engineer" or "technician" or "certifyingstaff",
                "shopmanager" => targetRole?.ToLower() is "teamleader"
                    or "engineer" or "technician" or "certifyingstaff",
                "teamleader" or "team_leader" => targetRole?.ToLower() is "engineer"
                    or "technician" or "certifyingstaff",
                _ => false
            };
        }

        /// <summary>
        /// Returns the base (default) permissions for a given role.
        /// </summary>
        private static TLPermissionsDto GetBasePermissions(string? role)
        {
            return role?.ToLower() switch
            {
                "admin" => new TLPermissionsDto
                {
                    IsTeamLeader = true,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = true,
                    CanViewReports = true,
                    CanManageSchedules = true,
                    CanManageUsers = true,
                    CanManageData = true,
                    CanWorkloadAdjustment = true,
                    CanManageCategories = true,
                    CanManageTaskTypes = true,
                    CanManagePriorities = true,
                    CanApprove = true,
                    CanReject = true,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = true,
                    CanExport = true,
                    CanViewAuditLog = true,
                },
                "director" => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = true,
                    CanViewReports = true,
                    CanManageSchedules = true,
                    CanManageUsers = true,
                    CanManageData = true,
                    CanWorkloadAdjustment = true,
                    CanManageCategories = true,
                    CanManageTaskTypes = true,
                    CanManagePriorities = true,
                    CanApprove = true,
                    CanReject = true,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = true,
                    CanExport = true,
                    CanViewAuditLog = true,
                },
                "manager" => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = true,
                    CanViewReports = true,
                    CanManageSchedules = true,
                    CanManageUsers = true,
                    CanManageData = true,
                    CanWorkloadAdjustment = true,
                    CanManageCategories = true,
                    CanManageTaskTypes = true,
                    CanManagePriorities = true,
                    CanApprove = true,
                    CanReject = true,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = true,
                    CanExport = true,
                    CanViewAuditLog = false,
                },
                "shopmanager" => new TLPermissionsDto
                {
                    IsTeamLeader = true,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = true,
                    CanViewReports = true,
                    CanManageSchedules = true,
                    CanManageUsers = true,
                    CanManageData = true,
                    CanWorkloadAdjustment = true,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = true,
                    CanReject = true,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = true,
                    CanExport = true,
                    CanViewAuditLog = false,
                },
                "teamleader" or "team_leader" => new TLPermissionsDto
                {
                    IsTeamLeader = true,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = true,
                    CanViewReports = true,
                    CanManageSchedules = true,
                    CanManageUsers = true,
                    CanManageData = true,
                    CanWorkloadAdjustment = true,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = true,
                    CanReject = true,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = true,
                    CanExport = true,
                    CanViewAuditLog = false,
                },
                "engineer" => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = true,
                    CanViewPerformanceMetrics = false,
                    CanViewReports = true,
                    CanManageSchedules = false,
                    CanManageUsers = false,
                    CanManageData = true,
                    CanWorkloadAdjustment = false,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = true,
                    CanReject = false,
                    CanSubmit = true,
                    CanReview = false,
                    CanDelegate = false,
                    CanExport = true,
                    CanViewAuditLog = false,
                },
                "technician" => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = false,
                    CanViewPerformanceMetrics = false,
                    CanViewReports = true,
                    CanManageSchedules = false,
                    CanManageUsers = false,
                    CanManageData = true,
                    CanWorkloadAdjustment = false,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = false,
                    CanReject = false,
                    CanSubmit = true,
                    CanReview = false,
                    CanDelegate = false,
                    CanExport = false,
                    CanViewAuditLog = false,
                },
                "certifyingstaff" => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = false,
                    CanViewPerformanceMetrics = false,
                    CanViewReports = true,
                    CanManageSchedules = false,
                    CanManageUsers = false,
                    CanManageData = true,
                    CanWorkloadAdjustment = false,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = true,
                    CanReject = false,
                    CanSubmit = true,
                    CanReview = true,
                    CanDelegate = false,
                    CanExport = false,
                    CanViewAuditLog = false,
                },
                _ => new TLPermissionsDto
                {
                    IsTeamLeader = false,
                    CanCreateTask = false,
                    CanViewPerformanceMetrics = false,
                    CanViewReports = true,
                    CanManageSchedules = false,
                    CanManageUsers = false,
                    CanManageData = false,
                    CanWorkloadAdjustment = false,
                    CanManageCategories = false,
                    CanManageTaskTypes = false,
                    CanManagePriorities = false,
                    CanApprove = false,
                    CanReject = false,
                    CanSubmit = false,
                    CanReview = false,
                    CanDelegate = false,
                    CanExport = false,
                    CanViewAuditLog = false,
                }
            };
        }

        /// <summary>
        /// Sets a specific permission on the DTO by name.
        /// </summary>
        private static void SetPermission(TLPermissionsDto perms, string permName, bool value)
        {
            switch (permName.ToLower().Trim())
            {
                case "cancreatetask": perms.CanCreateTask = value; break;
                case "canviewperformancemetrics": perms.CanViewPerformanceMetrics = value; break;
                case "canviewreports": perms.CanViewReports = value; break;
                case "canmanageschedules": perms.CanManageSchedules = value; break;
                case "canmanageusers": perms.CanManageUsers = value; break;
                case "canmanagedata": perms.CanManageData = value; break;
                case "canworkloadadjustment": perms.CanWorkloadAdjustment = value; break;
                case "canmanagecategories": perms.CanManageCategories = value; break;
                case "canmanagetasktypes": perms.CanManageTaskTypes = value; break;
                case "canmanagepriorities": perms.CanManagePriorities = value; break;
                case "canapprove": perms.CanApprove = value; break;
                case "canreject": perms.CanReject = value; break;
                case "cansubmit": perms.CanSubmit = value; break;
                case "canreview": perms.CanReview = value; break;
                case "candelegate": perms.CanDelegate = value; break;
                case "canexport": perms.CanExport = value; break;
                case "canviewauditlog": perms.CanViewAuditLog = value; break;
            }
        }

        /// <summary>
        /// Compares a base permission value with the requested value and categorizes it.
        /// </summary>
        private static void ComparePermission(bool baseValue, bool requestValue, string permName,
            List<string> additional, List<string> revoked)
        {
            if (requestValue && !baseValue)
                additional.Add(permName);
            else if (!requestValue && baseValue)
                revoked.Add(permName);
        }

        /// <summary>
        /// Applies additional and revoked permissions to a base permission set.
        /// </summary>
        private static TLPermissionsDto ApplyPermissionOverrides(TLPermissionsDto permissions,
            string? additionalPermissions, string? revokedPermissions)
        {
            // Apply additional permissions
            if (!string.IsNullOrEmpty(additionalPermissions))
            {
                var additional = additionalPermissions.Split(',', StringSplitOptions.RemoveEmptyEntries);
                foreach (var perm in additional)
                {
                    SetPermission(permissions, perm.Trim(), true);
                }
            }

            // Apply revoked permissions
            if (!string.IsNullOrEmpty(revokedPermissions))
            {
                var revoked = revokedPermissions.Split(',', StringSplitOptions.RemoveEmptyEntries);
                foreach (var perm in revoked)
                {
                    SetPermission(permissions, perm.Trim(), false);
                }
            }

            return permissions;
        }

        #endregion

        #region GET Endpoints

        /// <summary>
        /// Get computed permissions for a specific user.
        /// GET /api/tl-permissions/{userId}
        /// </summary>
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetPermissions(long userId)
        {
            var user = await _context.Users
                .Where(u => u.Id == userId && u.RecordStatus != RecordStatus.Deleted)
                .FirstOrDefaultAsync();

            if (user == null)
                return NotFound(new { message = "User not found" });

            // Compute permissions
            var permissions = GetBasePermissions(user.Role);
            permissions = ApplyPermissionOverrides(permissions, user.AdditionalPermissions, user.RevokedPermissions);

            // Set metadata
            permissions.UserId = userId;
            permissions.Role = user.Role;
            permissions.ShopId = user.ShopId;
            permissions.DepartmentId = user.DepartmentId;
            permissions.FullName = user.FullName;
            permissions.IsActive = user.IsActive;

            return Ok(permissions);
        }

        /// <summary>
        /// Get computed permissions for the currently authenticated user.
        /// GET /api/tl-permissions/me
        /// </summary>
        [HttpGet("me")]
        public async Task<IActionResult> GetMyPermissions()
        {
            var userId = GetCurrentUserId();
            if (userId == 0)
                return Unauthorized(new { message = "Invalid token" });

            var user = await _context.Users
                .Where(u => u.Id == userId && u.RecordStatus != RecordStatus.Deleted)
                .FirstOrDefaultAsync();

            if (user == null)
                return NotFound(new { message = "User not found" });

            var permissions = GetBasePermissions(user.Role);
            permissions = ApplyPermissionOverrides(permissions, user.AdditionalPermissions, user.RevokedPermissions);

            permissions.UserId = userId;
            permissions.Role = user.Role;
            permissions.ShopId = user.ShopId;
            permissions.DepartmentId = user.DepartmentId;
            permissions.FullName = user.FullName;
            permissions.IsActive = user.IsActive;

            return Ok(permissions);
        }

        /// <summary>
        /// Get default (base) permissions for a specific role without any overrides.
        /// GET /api/tl-permissions/role/{role}
        /// </summary>
        [HttpGet("role/{role}")]
        public IActionResult GetRolePermissions(string role)
        {
            if (string.IsNullOrWhiteSpace(role))
                return BadRequest(new { message = "Role is required" });

            var permissions = GetBasePermissions(role);
            permissions.Role = role;

            return Ok(permissions);
        }

        /// <summary>
        /// Get permissions for all active users in a specific shop.
        /// GET /api/tl-permissions/shop/{shopId}
        /// </summary>
        [HttpGet("shop/{shopId}")]
        public async Task<IActionResult> GetShopPermissions(Guid shopId)
        {
            var users = await _context.Users
                .Where(u => u.ShopId == shopId && u.IsActive && u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync();

            var result = users.Select(user =>
            {
                var permissions = GetBasePermissions(user.Role);
                permissions = ApplyPermissionOverrides(permissions, user.AdditionalPermissions, user.RevokedPermissions);
                permissions.UserId = user.Id;
                permissions.Role = user.Role;
                permissions.ShopId = user.ShopId;
                permissions.DepartmentId = user.DepartmentId;
                permissions.FullName = user.FullName;
                permissions.IsActive = user.IsActive;
                return permissions;
            }).ToList();

            return Ok(result);
        }

        /// <summary>
        /// Get permissions for all active users in a specific department.
        /// GET /api/tl-permissions/department/{departmentId}
        /// </summary>
        [HttpGet("department/{departmentId}")]
        public async Task<IActionResult> GetDepartmentPermissions(Guid departmentId)
        {
            var users = await _context.Users
                .Where(u => u.DepartmentId == departmentId && u.IsActive && u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync();

            var result = users.Select(user =>
            {
                var permissions = GetBasePermissions(user.Role);
                permissions = ApplyPermissionOverrides(permissions, user.AdditionalPermissions, user.RevokedPermissions);
                permissions.UserId = user.Id;
                permissions.Role = user.Role;
                permissions.ShopId = user.ShopId;
                permissions.DepartmentId = user.DepartmentId;
                permissions.FullName = user.FullName;
                permissions.IsActive = user.IsActive;
                return permissions;
            }).ToList();

            return Ok(result);
        }

        /// <summary>
        /// Check if a specific user has a specific permission.
        /// GET /api/tl-permissions/{userId}/check/{permissionName}
        /// </summary>
        [HttpGet("{userId}/check/{permissionName}")]
        public async Task<IActionResult> CheckPermission(long userId, string permissionName)
        {
            var user = await _context.Users
                .Where(u => u.Id == userId && u.RecordStatus != RecordStatus.Deleted)
                .FirstOrDefaultAsync();

            if (user == null)
                return NotFound(new { message = "User not found" });

            if (!user.IsActive)
                return Ok(new { userId, permission = permissionName, hasPermission = false, reason = "User is inactive" });

            var permissions = GetBasePermissions(user.Role);
            permissions = ApplyPermissionOverrides(permissions, user.AdditionalPermissions, user.RevokedPermissions);

            var hasPermission = permissionName.ToLower().Trim() switch
            {
                "cancreatetask" => permissions.CanCreateTask,
                "canviewperformancemetrics" => permissions.CanViewPerformanceMetrics,
                "canviewreports" => permissions.CanViewReports,
                "canmanageschedules" => permissions.CanManageSchedules,
                "canmanageusers" => permissions.CanManageUsers,
                "canmanagedata" => permissions.CanManageData,
                "canworkloadadjustment" => permissions.CanWorkloadAdjustment,
                "canmanagecategories" => permissions.CanManageCategories,
                "canmanagetasktypes" => permissions.CanManageTaskTypes,
                "canmanagepriorities" => permissions.CanManagePriorities,
                "canapprove" => permissions.CanApprove,
                "canreject" => permissions.CanReject,
                "cansubmit" => permissions.CanSubmit,
                "canreview" => permissions.CanReview,
                "candelegate" => permissions.CanDelegate,
                "canexport" => permissions.CanExport,
                "canviewauditlog" => permissions.CanViewAuditLog,
                "isteamleader" => permissions.IsTeamLeader,
                _ => false
            };

            return Ok(new
            {
                userId,
                permission = permissionName,
                hasPermission,
                role = user.Role
            });
        }

        #endregion

        #region PUT Endpoints

        /// <summary>
        /// Update permissions for a specific user.
        /// Compares the requested permissions with role defaults to determine
        /// which are additional grants and which are revocations.
        /// PUT /api/tl-permissions/{userId}
        /// </summary>
        [HttpPut("{userId}")]
        public async Task<IActionResult> UpdatePermissions(long userId, [FromBody] TLPermissionsDto request)
        {
            if (request == null)
                return BadRequest(new { message = "Request body is required" });

            var user = await _context.Users.FindAsync(userId);
            if (user == null || user.RecordStatus == RecordStatus.Deleted)
                return NotFound(new { message = "User not found" });

            // Check if current user can manage this user's permissions
            var currentUserRole = GetCurrentUserRole();
            if (!CanManagePermissions(currentUserRole, user.Role))
                return StatusCode(403, new { message = "You do not have permission to manage this user's permissions" });

            // Build additional permissions list from the request by comparing with base
            var additionalPerms = new List<string>();
            var revokedPerms = new List<string>();

            var basePerms = GetBasePermissions(user.Role);

            // Compare each permission with base and determine additions/revocations
            ComparePermission(basePerms.CanCreateTask, request.CanCreateTask, "canCreateTask", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanViewPerformanceMetrics, request.CanViewPerformanceMetrics, "canViewPerformanceMetrics", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanViewReports, request.CanViewReports, "canViewReports", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManageSchedules, request.CanManageSchedules, "canManageSchedules", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManageUsers, request.CanManageUsers, "canManageUsers", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManageData, request.CanManageData, "canManageData", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanWorkloadAdjustment, request.CanWorkloadAdjustment, "canWorkloadAdjustment", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManageCategories, request.CanManageCategories, "canManageCategories", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManageTaskTypes, request.CanManageTaskTypes, "canManageTaskTypes", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanManagePriorities, request.CanManagePriorities, "canManagePriorities", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanApprove, request.CanApprove, "canApprove", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanReject, request.CanReject, "canReject", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanSubmit, request.CanSubmit, "canSubmit", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanReview, request.CanReview, "canReview", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanDelegate, request.CanDelegate, "canDelegate", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanExport, request.CanExport, "canExport", additionalPerms, revokedPerms);
            ComparePermission(basePerms.CanViewAuditLog, request.CanViewAuditLog, "canViewAuditLog", additionalPerms, revokedPerms);

            // Save to user record
            user.AdditionalPermissions = additionalPerms.Count > 0 ? string.Join(",", additionalPerms) : null;
            user.RevokedPermissions = revokedPerms.Count > 0 ? string.Join(",", revokedPerms) : null;
            user.UpdateAudit(User.FindFirst("fullName")?.Value ?? "system");

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Permissions updated successfully",
                userId,
                additionalPermissions = additionalPerms,
                revokedPermissions = revokedPerms
            });
        }

        /// <summary>
        /// Reset a user's permissions back to role defaults (removes all overrides).
        /// PUT /api/tl-permissions/{userId}/reset
        /// </summary>
        [HttpPut("{userId}/reset")]
        public async Task<IActionResult> ResetPermissions(long userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null || user.RecordStatus == RecordStatus.Deleted)
                return NotFound(new { message = "User not found" });

            var currentUserRole = GetCurrentUserRole();
            if (!CanManagePermissions(currentUserRole, user.Role))
                return StatusCode(403, new { message = "You do not have permission to reset this user's permissions" });

            user.AdditionalPermissions = null;
            user.RevokedPermissions = null;
            user.UpdateAudit(User.FindFirst("fullName")?.Value ?? "system");

            await _context.SaveChangesAsync();

            // Return the default permissions for the role
            var permissions = GetBasePermissions(user.Role);
            permissions.UserId = userId;
            permissions.Role = user.Role;
            permissions.ShopId = user.ShopId;
            permissions.DepartmentId = user.DepartmentId;
            permissions.FullName = user.FullName;
            permissions.IsActive = user.IsActive;

            return Ok(new
            {
                message = "Permissions reset to role defaults successfully",
                permissions
            });
        }

        /// <summary>
        /// Bulk update permissions for multiple users.
        /// PUT /api/tl-permissions/bulk
        /// </summary>
        [HttpPut("bulk")]
        public async Task<IActionResult> BulkUpdatePermissions([FromBody] BulkPermissionsRequest request)
        {
            if (request == null || request.UserIds == null || !request.UserIds.Any())
                return BadRequest(new { message = "UserIds list is required" });

            if (request.Permissions == null)
                return BadRequest(new { message = "Permissions object is required" });

            var currentUserRole = GetCurrentUserRole();

            var users = await _context.Users
                .Where(u => request.UserIds.Contains(u.Id) && u.RecordStatus != RecordStatus.Deleted)
                .ToListAsync();

            if (!users.Any())
                return NotFound(new { message = "No valid users found" });

            var updatedCount = 0;
            var skippedUsers = new List<long>();

            foreach (var user in users)
            {
                // Check permission for each user
                if (!CanManagePermissions(currentUserRole, user.Role))
                {
                    skippedUsers.Add(user.Id);
                    continue;
                }

                var additionalPerms = new List<string>();
                var revokedPerms = new List<string>();
                var basePerms = GetBasePermissions(user.Role);

                ComparePermission(basePerms.CanCreateTask, request.Permissions.CanCreateTask, "canCreateTask", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanViewPerformanceMetrics, request.Permissions.CanViewPerformanceMetrics, "canViewPerformanceMetrics", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanViewReports, request.Permissions.CanViewReports, "canViewReports", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManageSchedules, request.Permissions.CanManageSchedules, "canManageSchedules", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManageUsers, request.Permissions.CanManageUsers, "canManageUsers", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManageData, request.Permissions.CanManageData, "canManageData", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanWorkloadAdjustment, request.Permissions.CanWorkloadAdjustment, "canWorkloadAdjustment", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManageCategories, request.Permissions.CanManageCategories, "canManageCategories", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManageTaskTypes, request.Permissions.CanManageTaskTypes, "canManageTaskTypes", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanManagePriorities, request.Permissions.CanManagePriorities, "canManagePriorities", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanApprove, request.Permissions.CanApprove, "canApprove", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanReject, request.Permissions.CanReject, "canReject", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanSubmit, request.Permissions.CanSubmit, "canSubmit", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanReview, request.Permissions.CanReview, "canReview", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanDelegate, request.Permissions.CanDelegate, "canDelegate", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanExport, request.Permissions.CanExport, "canExport", additionalPerms, revokedPerms);
                ComparePermission(basePerms.CanViewAuditLog, request.Permissions.CanViewAuditLog, "canViewAuditLog", additionalPerms, revokedPerms);

                user.AdditionalPermissions = additionalPerms.Count > 0 ? string.Join(",", additionalPerms) : null;
                user.RevokedPermissions = revokedPerms.Count > 0 ? string.Join(",", revokedPerms) : null;
                user.UpdateAudit(User.FindFirst("fullName")?.Value ?? "system");
                updatedCount++;
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Permissions updated for {updatedCount} user(s)",
                updatedCount,
                skippedCount = skippedUsers.Count,
                skippedUsers = skippedUsers.Any() ? skippedUsers : null
            });
        }

        #endregion
    }

    // ===== DTO Classes =====

    /// <summary>
    /// Data Transfer Object for Team Leader / User permissions.
    /// Represents the computed permission set for a user.
    /// </summary>
    public class TLPermissionsDto
    {
        // Metadata
        public long UserId { get; set; }
        public string? Role { get; set; }
        public Guid? ShopId { get; set; }
        public Guid? DepartmentId { get; set; }
        public string? FullName { get; set; }
        public bool IsActive { get; set; } = true;

        // Role flag
        public bool IsTeamLeader { get; set; }

        // Task & Data permissions
        public bool CanCreateTask { get; set; }
        public bool CanManageData { get; set; }
        public bool CanManageCategories { get; set; }
        public bool CanManageTaskTypes { get; set; }
        public bool CanManagePriorities { get; set; }

        // People & Schedule permissions
        public bool CanManageUsers { get; set; }
        public bool CanManageSchedules { get; set; }
        public bool CanWorkloadAdjustment { get; set; }

        // Reporting & Metrics permissions
        public bool CanViewPerformanceMetrics { get; set; }
        public bool CanViewReports { get; set; }
        public bool CanExport { get; set; }
        public bool CanViewAuditLog { get; set; }

        // Workflow permissions
        public bool CanApprove { get; set; }
        public bool CanReject { get; set; }
        public bool CanSubmit { get; set; }
        public bool CanReview { get; set; }
        public bool CanDelegate { get; set; }
    }

    /// <summary>
    /// Request DTO for bulk permission updates.
    /// </summary>
    public class BulkPermissionsRequest
    {
        public List<long> UserIds { get; set; } = new();
        public TLPermissionsDto Permissions { get; set; } = new();
    }
}