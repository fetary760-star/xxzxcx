using CMT.Application.Interfaces;
using CMT.Domain.Models;
using CMT.Domain.Data;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TaskEntity = CMT.Domain.Models.Task;

namespace CMT.Application.Services
{
    public class AuthorizationService : IAuthorizationService
    {
        private readonly ApplicationDbContext _context;
        private readonly Dictionary<UserRole, List<string>> _rolePermissions;

        public AuthorizationService(ApplicationDbContext context)
        {
            _context = context;
            _rolePermissions = InitializeRolePermissions();
        }

        private Dictionary<UserRole, List<string>> InitializeRolePermissions()
        {
            return new Dictionary<UserRole, List<string>>
            {
                // NEW: Admin role with full system access
                [UserRole.Admin] = new List<string>
                {
                    // Full system access - all permissions
                    "create_task", "view_all_tasks", "update_task_status",
                    "delete_task", "assign_task", "complete_task",
                    "request_amendment", "approve_amendment",
                    "create_user", "view_all_users", "update_user",
                    "delete_user", "manage_roles",
                    "manage_categories", "manage_priorities",
                    "view_reports", "export_data", "system_settings",
                    "view_all_performance",
                    "manage_shops", "create_shop", "edit_shop", "delete_shop",
                    "view_shops", "assign_team_leader",
                    "ViewTasks", "CreateTasks", "EditTasks", "DeleteTasks",
                    // Admin-specific permissions
                    "create_director", "manage_directors", "view_admin_dashboard"
                },
                [UserRole.Director] = new List<string>
                {
                    // Full system access - both old and new permission names
                    "create_task", "view_all_tasks", "update_task_status",
                    "delete_task", "assign_task", "complete_task",
                    "request_amendment", "approve_amendment",
                    "create_user", "view_all_users", "update_user",
                    "delete_user", "manage_roles",
                    "manage_categories", "manage_priorities",
                    "view_reports", "export_data", "system_settings",
                    "view_all_performance",
                    // Shop management permissions for Directors
                    "manage_shops", "create_shop", "edit_shop", "delete_shop",
                    "view_shops", "assign_team_leader",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks", "DeleteTasks"
                },
                [UserRole.Manager] = new List<string>
                {
                    // Manager role with full permissions to manage Shop Team Leaders
                    "create_task", "view_all_tasks", "update_task_status",
                    "delete_task", "assign_task", "complete_task",
                    "request_amendment",
                    "create_user", "view_all_users", "update_user",
                    "delete_user", "manage_roles",
                    "manage_categories", "manage_priorities",
                    "view_reports", "export_data",
                    "view_team_performance",
                    // Shop management permissions for Managers
                    "manage_shops", "create_shop", "edit_shop", "delete_shop",
                    "view_shops", "assign_team_leader",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks", "DeleteTasks"
                },
                [UserRole.TeamLeader] = new List<string>
                {
                    // Team management and task oversight
                    "create_task", "view_all_tasks", "update_task_status",
                    "delete_task", "assign_task", "complete_task",
                    "request_amendment",
                    "create_user", "view_all_users", "update_user",
                    "delete_user", "manage_roles",
                    "manage_categories", "manage_priorities",
                    "view_reports", "export_data",
                    "view_team_performance",
                    // Shop management permissions for Team Leaders
                    "manage_shops", "create_shop", "edit_shop", "delete_shop",
                    "view_shops", "assign_team_leader",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks", "DeleteTasks"
                },

                // ═══════════════════════════════════════════════════════════════
                // NEW: Shop Manager - Manager-like but SHOP-SCOPED with limited permissions
                // ═══════════════════════════════════════════════════════════════
                [UserRole.MiniManager] = new List<string>
                {
                    // Task management within their shop
                    "create_task", "view_all_tasks", "update_task_status",
                    "assign_task", "complete_task",
                    "request_amendment",

                    // Limited user management (only within their shop)
                    "create_user", "view_all_users", "update_user",

                    // View capabilities
                    "view_team_performance", "view_reports",

                    // Shop management (view only, no create/delete/edit shop)
                    "view_shops",

                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks"

                    // ═══════════════════════════════════════════════════════════
                    // DELIBERATELY EXCLUDED (differences from full Manager):
                    // ═══════════════════════════════════════════════════════════
                    // "delete_task"          - No task deletion rights
                    // "delete_user"          - No user deletion rights
                    // "DeleteTasks"          - No task deletion via controller
                    // "manage_roles"         - Cannot change roles
                    // "approve_amendment"    - Cannot approve amendments
                    // "manage_shops"         - No shop CRUD
                    // "create_shop"          - Cannot create shops
                    // "edit_shop"            - Cannot edit shops
                    // "delete_shop"          - Cannot delete shops
                    // "assign_team_leader"   - Cannot assign TLs
                    // "system_settings"      - No system access
                    // "export_data"          - No data export
                    // "manage_categories"    - No category config changes
                    // "manage_priorities"    - No priority config changes
                },

                [UserRole.ShopTL] = new List<string>
                {
                    // Shop Team Leaders with full shop management privileges
                    "create_task", "view_all_tasks", "update_task_status",
                    "delete_task", "assign_task", "complete_task", "request_amendment",
                    "create_user", "view_all_users", "update_user", "delete_user", "manage_roles",
                    "view_team_performance", "view_reports", "export_data",
                    // Full shop management permissions
                    "manage_shops", "create_shop", "edit_shop", "delete_shop",
                    "view_shops", "assign_team_leader",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks", "DeleteTasks"
                },
                [UserRole.Engineer] = new List<string>
                {
                    // Task execution and personal management
                    "view_own_tasks", "update_task_status",
                    "request_amendment", "view_performance",
                    // New permission names used by controllers
                    "ViewTasks", "EditTasks"
                },
                [UserRole.CustomerPersonnel] = new List<string>
                {
                    // Department task creation and tracking
                    "create_task", "view_own_tasks",
                    "update_task_status", "request_amendment",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks", "EditTasks"
                },
                [UserRole.Customer] = new List<string>
                {
                    // Basic task creation and viewing
                    "create_task", "view_own_tasks",
                    // New permission names used by controllers
                    "ViewTasks", "CreateTasks"
                }
            };
        }

        public async System.Threading.Tasks.Task<bool> HasPermissionAsync(ClaimsPrincipal user, string permission)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            return await HasPermissionAsync(userId.Value, permission);
        }

        public async System.Threading.Tasks.Task<bool> HasPermissionAsync(int userId, string permission)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null || user.Status != UserStatus.Active) return false;

            var rolePermissions = _rolePermissions.GetValueOrDefault(user.Role, new List<string>());
            
            // Log permission check for debugging
            Console.WriteLine($"Checking permission '{permission}' for user {userId} with role {user.Role}");
            Console.WriteLine($"Available permissions: {string.Join(", ", rolePermissions)}");
            
            return rolePermissions.Contains(permission);
        }

        public async System.Threading.Tasks.Task<bool> HasRoleAsync(ClaimsPrincipal user, CMT.Application.DTOs.UserRole role)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            return await HasRoleAsync(userId.Value, role);
        }

        public async System.Threading.Tasks.Task<bool> HasRoleAsync(int userId, CMT.Application.DTOs.UserRole role)
        {
            var user = await _context.Users.FindAsync(userId);
            var hasRole = user != null && (int)user.Role == (int)role && user.Status == UserStatus.Active;
            
            // Log role check for debugging
            Console.WriteLine($"Checking role {role} for user {userId}. User role: {user?.Role}, Active: {user?.Status == UserStatus.Active}, Result: {hasRole}");
            
            return hasRole;
        }

        public async System.Threading.Tasks.Task<bool> CanAccessTaskAsync(ClaimsPrincipal user, int taskId)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var userEntity = await _context.Users.FindAsync(userId.Value);
            if (userEntity == null || userEntity.Status != UserStatus.Active) return false;

            var task = await _context.Tasks
                .Include(t => t.Creator)
                .FirstOrDefaultAsync(t => t.TaskId == taskId);

            if (task == null) return false;

            // Admin, Directors, Team Leaders, Managers, and Shop Team Leaders can access all tasks
            if (userEntity.Role == UserRole.Admin ||
                userEntity.Role == UserRole.Director || 
                userEntity.Role == UserRole.TeamLeader ||
                userEntity.Role == UserRole.Manager ||
                userEntity.Role == UserRole.ShopTL)
                return true;

            // NEW: Shop Manager can only access tasks in their assigned shop
            if (userEntity.Role == UserRole.MiniManager)
            {
                if (!userEntity.ShopId.HasValue) return false;
                // Can access tasks that belong to their shop
                return task.ShopId == userEntity.ShopId;
            }

            // Users can access tasks they created
            return task.CreatedBy == userId.Value;
        }

        public async System.Threading.Tasks.Task<bool> CanManageUserAsync(ClaimsPrincipal user, int targetUserId)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var currentUser = await _context.Users.FindAsync(userId.Value);
            var targetUser = await _context.Users.FindAsync(targetUserId);

            if (currentUser == null || targetUser == null || currentUser.Status != UserStatus.Active) return false;

            // Users cannot manage themselves through this method
            if (userId.Value == targetUserId) return false;

            // Admin can manage all users including Directors
            if (currentUser.Role == UserRole.Admin) return true;

            // Directors can manage all users except Admin
            if (currentUser.Role == UserRole.Director && targetUser.Role != UserRole.Admin) return true;

            // Managers can manage Shop Team Leaders assigned to them
            if (currentUser.Role == UserRole.Manager)
            {
                // Can manage Shop Team Leaders assigned to them
                if (targetUser.Role == UserRole.ShopTL && targetUser.ManagerId == userId.Value)
                {
                    return true;
                }

                // Can manage Shop Managers assigned to them
                if (targetUser.Role == UserRole.MiniManager && targetUser.ManagerId == userId.Value)
                {
                    return true;
                }
                
                // Can also manage users created by their Shop Team Leaders (customer_personnel)
                if (targetUser.CreatedByUserId.HasValue)
                {
                    var creator = await _context.Users.FindAsync(targetUser.CreatedByUserId.Value);
                    if (creator?.Role == UserRole.ShopTL && creator.ManagerId == userId.Value)
                    {
                        return true;
                    }
                    // Can also manage users created by their Shop Managers
                    if (creator?.Role == UserRole.MiniManager && creator.ManagerId == userId.Value)
                    {
                        return true;
                    }
                }
                
                return false;
            }

            // Team Leaders can manage users below their level
            if (currentUser.Role == UserRole.TeamLeader && 
                IsHigherRole((CMT.Application.DTOs.UserRole)currentUser.Role, (CMT.Application.DTOs.UserRole)targetUser.Role)) return true;

            // NEW: Shop Manager can manage users within their shop only
            if (currentUser.Role == UserRole.MiniManager)
            {
                // Must have a shop assigned
                if (!currentUser.ShopId.HasValue) return false;

                // Can only manage customer_personnel, engineers, and customers in their shop
                var allowedTargetRoles = new[] { 
                    UserRole.Engineer, UserRole.Customer, UserRole.CustomerPersonnel 
                };

                var canManage = allowedTargetRoles.Contains(targetUser.Role) && 
                               targetUser.ShopId == currentUser.ShopId;
                Console.WriteLine($"Shop Manager {userId.Value} managing user {targetUserId} with role {targetUser.Role} in shop {targetUser.ShopId}: {canManage}");
                return canManage;
            }

            // Shop Team Leaders can manage lower-level roles
            if (currentUser.Role == UserRole.ShopTL)
            {
                var allowedTargetRoles = new[] { UserRole.Engineer, UserRole.Customer, UserRole.CustomerPersonnel };
                var canManage = allowedTargetRoles.Contains(targetUser.Role);
                Console.WriteLine($"Shop TL {userId.Value} managing user {targetUserId} with role {targetUser.Role}: {canManage}");
                return canManage;
            }

            return false;
        }

        public async System.Threading.Tasks.Task<bool> CanCreateUserInShopAsync(ClaimsPrincipal user, int? targetShopId, string targetRole)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var currentUser = await _context.Users.FindAsync(userId.Value);
            if (currentUser == null || currentUser.Status != UserStatus.Active) return false;

            // Admin, Directors, Team Leaders, Managers, and Shop Team Leaders can create users in any shop
            if (currentUser.Role == UserRole.Admin ||
                currentUser.Role == UserRole.Director || 
                currentUser.Role == UserRole.TeamLeader ||
                currentUser.Role == UserRole.Manager ||
                currentUser.Role == UserRole.ShopTL)
                return true;

            // NEW: Shop Manager can only create users in their own shop
            if (currentUser.Role == UserRole.MiniManager)
            {
                if (!currentUser.ShopId.HasValue) return false;

                // Can only create customer_personnel in their own shop
                if (!DTOs.ValidRoles.isShopManagerAllowedRole(targetRole)) return false;

                // Must be creating in their own shop
                if (targetShopId.HasValue && targetShopId.Value != currentUser.ShopId.Value) return false;

                return true;
            }

            return false;
        }

        public async System.Threading.Tasks.Task<bool> CanManageShopAsync(ClaimsPrincipal user, int? shopId = null)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var currentUser = await _context.Users.FindAsync(userId.Value);
            if (currentUser == null || currentUser.Status != UserStatus.Active) return false;

            // Admin, Directors, Team Leaders, Managers, and Shop Team Leaders can manage ALL shops
            if (currentUser.Role == UserRole.Admin ||
                currentUser.Role == UserRole.Director || 
                currentUser.Role == UserRole.TeamLeader ||
                currentUser.Role == UserRole.Manager ||
                currentUser.Role == UserRole.ShopTL)
            {
                Console.WriteLine($"User {userId} with role {currentUser.Role} granted shop management privileges");
                return true;
            }

            // NEW: Shop Manager can only manage their own shop (view/limited management)
            if (currentUser.Role == UserRole.MiniManager)
            {
                if (!currentUser.ShopId.HasValue) return false;
                // If shopId is specified, must match their shop
                if (shopId.HasValue) return shopId.Value == currentUser.ShopId.Value;
                return true; // General shop management access for their shop
            }

            return false;
        }

        public async System.Threading.Tasks.Task<bool> IsInSameShopAsync(int userId1, int userId2)
        {
            var user1 = await _context.Users.FindAsync(userId1);
            var user2 = await _context.Users.FindAsync(userId2);

            return user1?.ShopId != null && user1.ShopId == user2?.ShopId;
        }

        public async System.Threading.Tasks.Task<bool> IsSupervisorOfAsync(int supervisorId, int subordinateId)
        {
            var subordinate = await _context.Users.FindAsync(subordinateId);
            return subordinate?.SupervisorId == supervisorId;
        }

        public async System.Threading.Tasks.Task<List<string>> GetUserPermissionsAsync(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null || user.Status != UserStatus.Active) return new List<string>();

            return _rolePermissions.GetValueOrDefault(user.Role, new List<string>());
        }

        public async System.Threading.Tasks.Task<List<string>> GetRolePermissionsAsync(CMT.Application.DTOs.UserRole role)
        {
            await System.Threading.Tasks.Task.CompletedTask; // For async consistency
            var domainRole = (UserRole)role;
            return _rolePermissions.GetValueOrDefault(domainRole, new List<string>());
        }

        public bool IsHigherRole(CMT.Application.DTOs.UserRole role1, CMT.Application.DTOs.UserRole role2)
        {
            var roleHierarchy = new Dictionary<CMT.Application.DTOs.UserRole, int>
            {
                [CMT.Application.DTOs.UserRole.Customer] = 1,
                [CMT.Application.DTOs.UserRole.CustomerPersonnel] = 2,
                [CMT.Application.DTOs.UserRole.Engineer] = 3,
                [CMT.Application.DTOs.UserRole.ShopTeamLeader] = 5,
                [CMT.Application.DTOs.UserRole.TeamLeader] = 5,
                [CMT.Application.DTOs.UserRole.MiniManager] = 5,    // NEW: Same level as Shop TL / Team Leader
                [CMT.Application.DTOs.UserRole.Manager] = 6,
                [CMT.Application.DTOs.UserRole.Director] = 7,
                [CMT.Application.DTOs.UserRole.Admin] = 8  // NEW: Highest role
            };

            return roleHierarchy.GetValueOrDefault(role1, 0) > roleHierarchy.GetValueOrDefault(role2, 0);
        }

        public async System.Threading.Tasks.Task<bool> CanViewPerformanceAsync(ClaimsPrincipal user, int? targetUserId = null)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var currentUser = await _context.Users.FindAsync(userId.Value);
            if (currentUser == null || currentUser.Status != UserStatus.Active) return false;

            // Admin, Directors, Team Leaders, Managers, and Shop Team Leaders can view all performance data
            if (currentUser.Role == UserRole.Admin ||
                currentUser.Role == UserRole.Director || 
                currentUser.Role == UserRole.TeamLeader ||
                currentUser.Role == UserRole.Manager ||
                currentUser.Role == UserRole.ShopTL) 
                return true;

            // NEW: Shop Manager can view performance for users in their shop
            if (currentUser.Role == UserRole.MiniManager)
            {
                if (!currentUser.ShopId.HasValue) return false;
                if (targetUserId == null) return true; // Can view general performance for their shop

                // Check if target user is in the same shop
                var targetUser = await _context.Users.FindAsync(targetUserId.Value);
                return targetUser?.ShopId == currentUser.ShopId;
            }

            // Engineers can view their own performance
            if (currentUser.Role == UserRole.Engineer)
            {
                return targetUserId == null || targetUserId == userId.Value;
            }

            return false;
        }

        public async System.Threading.Tasks.Task<bool> CanAccessShopAsync(ClaimsPrincipal user, int shopId)
        {
            var userId = GetUserIdFromClaims(user);
            if (userId == null) return false;

            var currentUser = await _context.Users.FindAsync(userId.Value);
            if (currentUser == null || currentUser.Status != UserStatus.Active) return false;

            // Admin, Directors, Team Leaders, Managers, and Shop Team Leaders can access ALL shops
            if (currentUser.Role == UserRole.Admin ||
                currentUser.Role == UserRole.Director || 
                currentUser.Role == UserRole.TeamLeader ||
                currentUser.Role == UserRole.Manager ||
                currentUser.Role == UserRole.ShopTL)
                return true;

            // NEW: Shop Manager can only access their own shop
            if (currentUser.Role == UserRole.MiniManager)
            {
                return currentUser.ShopId.HasValue && currentUser.ShopId.Value == shopId;
            }

            return false;
        }

        private int? GetUserIdFromClaims(ClaimsPrincipal user)
        {
            var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(userIdClaim, out var userId) ? userId : null;
        }
    }
}