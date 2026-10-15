using CMT.Application.DTOs;
using System.Security.Claims;

namespace CMT.Application.Interfaces
{
    public interface IAuthorizationService
    {
        Task<bool> HasPermissionAsync(ClaimsPrincipal user, string permission);
        Task<bool> HasPermissionAsync(int userId, string permission);
        Task<bool> HasRoleAsync(ClaimsPrincipal user, UserRole role);
        Task<bool> HasRoleAsync(int userId, UserRole role);
        Task<bool> CanAccessTaskAsync(ClaimsPrincipal user, int taskId);
        Task<bool> CanManageUserAsync(ClaimsPrincipal user, int targetUserId);
        Task<bool> CanManageShopAsync(ClaimsPrincipal user, int? shopId = null);
        Task<bool> IsInSameShopAsync(int userId1, int userId2);
        Task<bool> IsSupervisorOfAsync(int supervisorId, int subordinateId);
        Task<List<string>> GetUserPermissionsAsync(int userId);
        Task<List<string>> GetRolePermissionsAsync(UserRole role);
        bool IsHigherRole(UserRole role1, UserRole role2);
        Task<bool> CanViewPerformanceAsync(ClaimsPrincipal user, int? targetUserId = null);
        Task<bool> CanAccessShopAsync(ClaimsPrincipal user, int shopId);
        Task<bool> CanCreateUserInShopAsync(ClaimsPrincipal user, int? targetShopId, string targetRole);
    }
}