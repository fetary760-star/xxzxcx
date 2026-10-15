using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    /// <summary>
    /// Service for managing Director-specific permissions
    /// </summary>
    public interface IDirectorPermissionService
    {
        /// <summary>
        /// Get permissions for a specific director
        /// </summary>
        Task<DirectorPermissionDto?> GetDirectorPermissionsAsync(int directorUserId);

        /// <summary>
        /// Create or update permissions for a director
        /// </summary>
        Task<DirectorPermissionDto> SetDirectorPermissionsAsync(UpdateDirectorPermissionDto permissionDto, int updatedByUserId);

        /// <summary>
        /// Check if a director has a specific permission
        /// </summary>
        Task<bool> HasPermissionAsync(int directorUserId, string permissionName);

        /// <summary>
        /// Get all directors with their permission details
        /// </summary>
        Task<List<DirectorWithPermissionsDto>> GetAllDirectorsWithPermissionsAsync();

        /// <summary>
        /// Reset director permissions to default values
        /// </summary>
        Task<DirectorPermissionDto> ResetToDefaultPermissionsAsync(int directorUserId, int updatedByUserId);
    }
}