using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IUserService
    {
        Task<LoginResponseDto?> AuthenticateAsync(LoginDto loginDto);
        Task<LoginResponseDto?> RefreshTokenAsync(string refreshToken);
        Task<bool> RevokeTokenAsync(string token);
        Task<UserDto?> GetUserByIdAsync(int userId);
        Task<UserDto?> GetUserByUsernameAsync(string username);
        Task<UserDto?> GetUserByUsernameOrFullNameAsync(string nameOrUsername);
        Task<List<UserDto>> GetAllUsersAsync();
        Task<List<UserDto>> GetUsersByRoleAsync(string role);
        Task<List<UserDto>> GetUsersByShopAsync(int shopId);
        Task<List<UserDto>> GetSubordinatesAsync(int supervisorId);
        Task<List<UserDto>> GetUsersCreatedByShopTLAsync(int shopTLUserId);
        
        // NEW: Get users created by a specific creator (shop_tl or other roles)
        Task<List<UserDto>> GetUsersByCreatorIdAsync(int creatorUserId);
        
        // NEW: Manager-related methods
        Task<List<UserDto>> GetManagedUsersAsync(int managerId);
        Task<ManagerDashboardDto> GetManagerDashboardAsync(int managerId);
        
        // Optimized method to get engineers only with minimal data for dropdowns
        Task<List<EngineerDto>> GetEngineersOnlyAsync();
        
        // Get comprehensive dashboard data for shop_tl
        Task<ShopTLDashboardDto> GetShopTLDashboardAsync(int shopTLUserId);
        
        // NEW: Admin-specific methods
        Task<AdminDashboardDto> GetAdminDashboardAsync(int adminUserId);
        Task<UserDto> CreateDirectorAsync(CreateUserDto createUserDto, int createdByAdminId, string? ipAddress = null);
        Task<UserDto> CreateDirectorWithDepartmentAsync(CreateDirectorWithDepartmentDto createDirectorDto, int createdByAdminId, string? ipAddress = null);
        
        Task<UserDto> CreateUserAsync(CreateUserDto createUserDto, int createdByUserId = 0, string? ipAddress = null);
        Task<UserDto> UpdateUserAsync(int userId, UpdateUserDto updateUserDto, int updatedByUserId = 0, string? ipAddress = null);
        Task<bool> DeleteUserAsync(int userId, int deletedByUserId = 0, string? ipAddress = null);
        Task<bool> ChangePasswordAsync(int userId, ChangePasswordDto changePasswordDto);
        Task<bool> ResetPasswordAsync(int userId, string newPassword);
        Task<bool> IsUsernameAvailableAsync(string username, int? excludeUserId = null);
        Task<bool> IsEmailAvailableAsync(string email, int? excludeUserId = null);
        string HashPassword(string password);
        bool VerifyPassword(string password, string hash);

        // ═══════════════════════════════════════════════════════════════════════
        // SOFT-DELETE MANAGEMENT METHODS (Admin only)
        // ═══════════════════════════════════════════════════════════════════════

        /// <summary>
        /// Retrieve all soft-deleted users (Status == Inactive)
        /// </summary>
        Task<List<UserDto>> GetSoftDeletedUsersAsync();

        /// <summary>
        /// Permanently hard-delete a soft-deleted user from the database.
        /// Non-nullable FK references (e.g. tasks.created_by) are reassigned to reassignToUserId.
        /// </summary>
        Task<bool> PermanentlyDeleteUserAsync(int userId, int reassignToUserId);

        /// <summary>
        /// Restore a soft-deleted user by setting Status back to Active
        /// </summary>
        Task<bool> RestoreUserAsync(int userId);
    }
}