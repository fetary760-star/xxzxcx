using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    /// <summary>
    /// Service for managing role-based permissions (the 7 operational roles × 12 permissions matrix).
    /// This replaces the previous localStorage-only approach.
    /// Permissions: delete_task, delete_user, reopen_task, view_performance_metrics,
    /// view_engineer_workload, view_analytics, mantenix_data, transfers, edit_user,
    /// workload_adjustment, create_task, request_amendment.
    /// </summary>
    public interface IRolePermissionService
    {
        /// <summary>
        /// Get the current role permission matrix.
        /// If no records exist in the database, returns the default matrix and seeds it.
        /// </summary>
        Task<RolePermissionMatrixDto> GetRolePermissionMatrixAsync();

        /// <summary>
        /// Update the entire role permission matrix (Admin/TeamLeader only).
        /// </summary>
        Task<RolePermissionMatrixDto> SetRolePermissionMatrixAsync(
            UpdateRolePermissionMatrixDto matrixDto,
            int updatedByUserId);

        /// <summary>
        /// Reset the role permission matrix to default values (Admin only).
        /// </summary>
        Task<RolePermissionMatrixDto> ResetToDefaultAsync(int updatedByUserId);

        /// <summary>
        /// Check if a specific role has a specific permission.
        /// </summary>
        Task<bool> HasPermissionAsync(string roleKey, string permissionKey);
    }
}