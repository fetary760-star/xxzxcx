using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IDirectorService
    {
        /// <summary>
        /// Get Director Dashboard with department-specific metrics
        /// UPDATED: Now includes Team Leaders created by Director and their tasks
        /// </summary>
        Task<DirectorDashboardDto> GetDirectorDashboardAsync(int directorUserId);

        /// <summary>
        /// Get all departments managed by this Director
        /// </summary>
        Task<List<DepartmentDto>> GetDirectorDepartmentsAsync(int directorUserId);

        /// <summary>
        /// Get all managers within the director's departments
        /// </summary>
        Task<List<UserDto>> GetDepartmentManagersAsync(int directorUserId);

        /// <summary>
        /// Get all users within the director's departments
        /// UPDATED: Now includes Team Leaders created by Director (even without DepartmentId)
        /// </summary>
        Task<List<UserDto>> GetDepartmentUsersAsync(int directorUserId);

        /// <summary>
        /// Get all user IDs within the director's assigned departments (for task filtering)
        /// Returns a list of user IDs that belong to departments where this director is the DirectorId
        /// UPDATED: Now includes all users created by Director (Team Leaders, etc.) regardless of DepartmentId
        /// </summary>
        Task<List<int>> GetDepartmentUserIdsAsync(int directorUserId);

        /// <summary>
        /// NEW: Get Team Leader names created by this Director (for task filtering by AssignedEngineer)
        /// Returns full names of Team Leaders that can be used to filter tasks by AssignedEngineer field
        /// </summary>
        Task<List<string>> GetDirectorTeamLeaderNamesAsync(int directorUserId);

        /// <summary>
        /// NEW: Get Team Leaders created by this Director with their task metrics
        /// Returns detailed information about each Team Leader including their Engineers and task statistics
        /// </summary>
        Task<List<TeamLeaderDetailDto>> GetDirectorTeamLeadersAsync(int directorUserId);
    }
}