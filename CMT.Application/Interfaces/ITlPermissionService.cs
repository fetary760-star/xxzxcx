using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    /// <summary>
    /// Service for managing Team Leader-specific permissions.
    /// Mirrors IDirectorPermissionService but for TeamLeader users.
    /// </summary>
    public interface ITlPermissionService
    {
        /// <summary>
        /// Get permissions for a specific team leader.
        /// </summary>
        Task<TlPermissionDto?> GetTlPermissionsAsync(int teamLeaderUserId);

        /// <summary>
        /// Create or update permissions for a team leader.
        /// </summary>
        Task<TlPermissionDto> SetTlPermissionsAsync(UpdateTlPermissionDto permissionDto, int updatedByUserId);

        /// <summary>
        /// Check if a team leader has a specific permission.
        /// </summary>
        Task<bool> HasPermissionAsync(int teamLeaderUserId, string permissionName);

        /// <summary>
        /// Get all team leaders with their permission details.
        /// </summary>
        Task<List<TeamLeaderWithPermissionsDto>> GetAllTeamLeadersWithPermissionsAsync();

        /// <summary>
        /// Reset team leader permissions to default values (all enabled).
        /// </summary>
        Task<TlPermissionDto> ResetToDefaultPermissionsAsync(int teamLeaderUserId, int updatedByUserId);
    }
}