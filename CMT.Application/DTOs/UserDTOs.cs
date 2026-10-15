using System.ComponentModel.DataAnnotations;

namespace CMT.Application.DTOs
{
    public enum UserRole
    {
        Customer = 1,
        CustomerPersonnel = 2,
        Engineer = 3,
        ShopTeamLeader = 4,
        TeamLeader = 5,
        Manager = 6,
        Director = 7,
        Admin = 8,
        MiniManager = 9  // NEW: Shop Manager role
    }

    public class UserDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string Role { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string RoleDisplayName => GetRoleDisplayName(Role, ShopName, PersonnelType);
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        public int? SupervisorId { get; set; }
        public string? SupervisorName { get; set; }
        
        // Track who created this user
        public int? CreatedByUserId { get; set; }
        public string? CreatedByUserName { get; set; }

        // Manager properties
        public int? ManagerId { get; set; }
        public string? ManagerName { get; set; }
        
        // Department assignment
        public int? DepartmentId { get; set; }
        public string? DepartmentName { get; set; }
        
        // Personnel type for customer_personnel role variations
        public string? PersonnelType { get; set; }
        
        // UPDATED: Team Leader permission for Directors
        public bool CanCreateTeamLeader { get; set; } = false;
        
        public string? ProfilePicturePath { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public DateTime? LastLoginAt { get; set; }
        public bool IsActive { get; set; }
        public List<string> Permissions { get; set; } = new List<string>();

        // Task statistics for users created by shop_tl
        public int ActiveTasksCount { get; set; } = 0;
        public int CompletedTasksCount { get; set; } = 0;
        public int PendingTasksCount { get; set; } = 0;
        
        // Performance metrics for Shop Team Leaders (when viewed by Manager)
        public double CompletionRate { get; set; } = 0;
        public double AverageDelayDays { get; set; } = 0;

        private static string GetRoleDisplayName(string role, string? shopName, string? personnelType)
        {
            // Handle customer_personnel role with personnel type variations
            if (role == "customer_personnel")
            {
                // Normalize personnelType to handle case variations
                var normalizedType = personnelType?.ToLower()?.Trim();
                
                return normalizedType switch
                {
                    "technician" => "Technician",
                    "tools_clerk" => "Tools Clerk",
                    "toolsclerk" => "Tools Clerk",
                    "warranty_officer" => "Warranty Officer",
                    "warrantyofficer " => "Warranty Officer",
                    _ => "Customer Personnel"
                };
            }

            var baseRoleName = role switch
            {
                "team_leader" => "Team Leader",
                "director" => "Director",
                "engineer" => "Engineer",
                "customer" => "Customer",
                "shop_tl" => "Shop Team Leader",
                "manager" => "Manager",
                "shop_manager" => "Shop Manager",  // NEW
                "admin" => "Admin",
                _ => role ?? "Unknown"
            };

            // For shop_tl AND shop_manager roles, append shop name if available
            if ((role == "shop_tl" || role == "shop_manager") && !string.IsNullOrEmpty(shopName))
            {
                return $"{baseRoleName} ({shopName})";
            }

            return baseRoleName;
        }
    }

    // Manager Dashboard DTO - Shows Shop Team Leaders managed by this Manager
    public class ManagerDashboardDto
    {
        public int ManagerUserId { get; set; }
        public string ManagerName { get; set; } = string.Empty;
        
        // Shop Team Leaders managed by this Manager
        public List<ShopTeamLeaderMetricsDto> ShopTeamLeaders { get; set; } = new List<ShopTeamLeaderMetricsDto>();
        public int TotalShopTeamLeaders { get; set; }
        
        // Aggregated metrics across all Shop Team Leaders
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalPendingTasks { get; set; }
        public double OverallCompletionRate { get; set; }
        public double OverallAverageDelay { get; set; }
        
        // Recent activity across all managed Shop Team Leaders
        public List<TaskSummaryDto> RecentTasks { get; set; } = new List<TaskSummaryDto>();
    }

    // Metrics for a single Shop Team Leader (for Manager view)
    public class ShopTeamLeaderMetricsDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int? ShopId { get; set; }
        public string? ShopName { get; set; }
        
        // Users created by this Shop Team Leader
        public int TotalUsersCreated { get; set; }
        public List<UserDto> CreatedUsers { get; set; } = new List<UserDto>();
        
        // Task metrics for this Shop Team Leader and their created users
        public int CompletedTasks { get; set; }
        public int ActiveTasks { get; set; }
        public int PendingTasks { get; set; }
        public double CompletionRate { get; set; }
        public double AverageDelayDays { get; set; }
        
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    // Shop TL Dashboard DTO
    public class ShopTLDashboardDto
    {
        public int ShopTLUserId { get; set; }
        public string ShopTLName { get; set; } = string.Empty;
        public string ShopName { get; set; } = string.Empty;
        public int ShopId { get; set; }
        
        // Manager overseeing this Shop TL
        public int? ManagerId { get; set; }
        public string? ManagerName { get; set; }
        
        // Users created by this Shop TL
        public List<UserDto> CreatedUsers { get; set; } = new List<UserDto>();
        public int TotalCreatedUsers { get; set; }
        
        // Task statistics for users created by this Shop TL
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalPendingTasks { get; set; }
        
        // Recent activity
        public List<TaskSummaryDto> RecentTasks { get; set; } = new List<TaskSummaryDto>();
        
        // Summary statistics
        public Dictionary<string, int> TaskStatusBreakdown { get; set; } = new Dictionary<string, int>();
    }

    // NEW: Shop Manager Dashboard DTO - Shows only data for their assigned shop
    public class MiniManagerDashboardDto
    {
        public int MiniManagerUserId { get; set; }
        public string MiniManagerName { get; set; } = string.Empty;
        public int? ShopId { get; set; }
        public string ShopName { get; set; } = string.Empty;

        // Manager overseeing this Shop Manager
        public int? ManagerId { get; set; }
        public string? ManagerName { get; set; }

        // Department info
        public int? DepartmentId { get; set; }
        public string? DepartmentName { get; set; }

        // Users in this shop
        public List<UserDto> ShopUsers { get; set; } = new List<UserDto>();
        public int TotalShopUsers { get; set; }

        // Users created by this Shop Manager
        public List<UserDto> CreatedUsers { get; set; } = new List<UserDto>();
        public int TotalCreatedUsers { get; set; }

        // Task statistics scoped to this shop
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        public int TotalPendingTasks { get; set; }
        public double CompletionRate { get; set; }
        public double AverageDelayDays { get; set; }

        // Recent activity in this shop
        public List<TaskSummaryDto> RecentTasks { get; set; } = new List<TaskSummaryDto>();
        public Dictionary<string, int> TaskStatusBreakdown { get; set; } = new();
    }

    // Admin Dashboard DTO - Shows all Directors and system overview
    public class AdminDashboardDto
    {
        public int AdminUserId { get; set; }
        public string AdminName { get; set; } = string.Empty;
        
        // All Directors in the system
        public List<DirectorSummaryDto> Directors { get; set; } = new List<DirectorSummaryDto>();
        public int TotalDirectors { get; set; }
        
        // System-wide statistics
        public int TotalDepartments { get; set; }
        public int TotalManagers { get; set; }
        public int TotalMiniManagers { get; set; }  // NEW
        public int TotalShopTeamLeaders { get; set; }
        public int TotalEngineers { get; set; }
        public int TotalCustomerPersonnel { get; set; }
        public int TotalActiveTasks { get; set; }
        public int TotalCompletedTasks { get; set; }
        
        // Recent system activity
        public List<TaskSummaryDto> RecentTasks { get; set; } = new List<TaskSummaryDto>();
    }

    // Director Summary for Admin view
    public class DirectorSummaryDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public int DepartmentCount { get; set; }
        public int ManagerCount { get; set; }
        public int TotalTeamMembers { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        // UPDATED: Track if director can create team leaders
        public bool CanCreateTeamLeader { get; set; } = false;
    }

    // Task summary for dashboard
    public class TaskSummaryDto
    {
        public int TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string CreatedByName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string? CategoryName { get; set; }
        public string? PriorityName { get; set; }
        public DateTime? TargetCompletionDate { get; set; }
        public int? DelayDays { get; set; }
    }

    public class CreateUserDto
    {
        [Required(ErrorMessage = "Full name is required")]
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Full name must be between 2 and 100 characters")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Username is required")]
        [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters")]
        [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Username can only contain letters, numbers, and underscores")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email is required")]
        [EmailAddress(ErrorMessage = "Please enter a valid email address")]
        [StringLength(100, ErrorMessage = "Email cannot exceed 100 characters")]
        public string Email { get; set; } = string.Empty;

        [Phone(ErrorMessage = "Please enter a valid phone number")]
        [StringLength(20, ErrorMessage = "Phone number cannot exceed 20 characters")]
        public string? PhoneNumber { get; set; }

        [Required(ErrorMessage = "Password is required")]
        [StringLength(100, MinimumLength = 6, ErrorMessage = "Password must be at least 6 characters long")]
        public string Password { get; set; } = string.Empty;

        [Required(ErrorMessage = "Role is required")]
        public string Role { get; set; } = string.Empty;

        public int? ShopId { get; set; }

        public int? SupervisorId { get; set; }

        // Manager assignment (REQUIRED for Shop Team Leader and Shop Manager roles)
        public int? ManagerId { get; set; }

        // Department assignment
        public int? DepartmentId { get; set; }

        // Department creation fields (for Admin creating Directors)
        public string? NewDepartmentName { get; set; }
        public string? NewDepartmentDescription { get; set; }

        // UPDATED: Team Leader permission for Directors (optional, set by Admin)
        public bool CanCreateTeamLeader { get; set; } = false;

        // Personnel type for customer_personnel role
        public string? PersonnelType { get; set; }

        public bool IsActive { get; set; } = true;
    }

    // DTO for Admin creating Director with department assignment
    public class CreateDirectorWithDepartmentDto
    {
        [Required(ErrorMessage = "Full name is required")]
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Full name must be between 2 and 100 characters")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "Username is required")]
        [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters")]
        [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Username can only contain letters, numbers, and underscores")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "Email is required")]
        [EmailAddress(ErrorMessage = "Please enter a valid email address")]
        [StringLength(100, ErrorMessage = "Email cannot exceed 100 characters")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "Password is required")]
        [StringLength(100, MinimumLength = 6, ErrorMessage = "Password must be at least 6 characters long")]
        public string Password { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        // Department assignment options
        public int? ExistingDepartmentId { get; set; }
        public string? NewDepartmentName { get; set; }
        public string? NewDepartmentDescription { get; set; }

        // UPDATED: Team Leader permission (optional, set by Admin)
        public bool CanCreateTeamLeader { get; set; } = false;
    }

    public class UpdateUserDto
    {
        [StringLength(100, MinimumLength = 2, ErrorMessage = "Full name must be between 2 and 100 characters")]
        public string? FullName { get; set; }

        [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters")]
        [RegularExpression(@"^[a-zA-Z0-9_]+$", ErrorMessage = "Username can only contain letters, numbers, and underscores")]
        public string? Username { get; set; }

        [EmailAddress(ErrorMessage = "Please enter a valid email address")]
        [StringLength(100, ErrorMessage = "Email cannot exceed 100 characters")]
        public string? Email { get; set; }

        [Phone(ErrorMessage = "Please enter a valid phone number")]
        [StringLength(20, ErrorMessage = "Phone number cannot exceed 20 characters")]
        public string? PhoneNumber { get; set; }

        public string? Role { get; set; }

        public int? ShopId { get; set; }

        public int? SupervisorId { get; set; }

        // Manager assignment
        public int? ManagerId { get; set; }

        // Department assignment
        public int? DepartmentId { get; set; }

        // Personnel type for customer_personnel role
        public string? PersonnelType { get; set; }

        public bool? IsActive { get; set; }

        [StringLength(100, MinimumLength = 6, ErrorMessage = "Password must be at least 6 characters long")]
        public string? NewPassword { get; set; }
        
        [StringLength(255)]
        public string? ProfilePicturePath { get; set; }
    }

    public class LoginDto
    {
        [Required]
        public string Username { get; set; } = string.Empty;

        [Required]
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponseDto
    {
        public string Token { get; set; } = string.Empty;
        public string RefreshToken { get; set; } = string.Empty;
        public UserDto User { get; set; } = null!;
        public DateTime ExpiresAt { get; set; }
        public List<string> Permissions { get; set; } = new List<string>();
    }

    public class RefreshTokenDto
    {
        [Required]
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class ChangePasswordDto
    {
        [Required]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required]
        [StringLength(100, MinimumLength = 6, ErrorMessage = "Password must be at least 6 characters long")]
        public string NewPassword { get; set; } = string.Empty;

        [Required]
        [Compare("NewPassword")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    // Helper class for role validation
    public static class ValidRoles
    {
        public static readonly string[] AllRoles = {
            "team_leader",
            "director", 
            "engineer",
            "customer_personnel",
            "customer",
            "shop_tl",
            "manager",
            "admin",
            "shop_manager"  // NEW
        };

        public static bool IsValidRole(string role)
        {
            return AllRoles.Contains(role);
        }
        
        // Roles that shop_tl can create (with personnel type variations)
        public static readonly string[] ShopTLAllowedRoles = {
            "customer_personnel"
        };
        
        public static bool IsShopTLAllowedRole(string role)
        {
            return ShopTLAllowedRoles.Contains(role);
        }

        // UPDATED: Roles that shop_manager can create (shop_tl, customer personnel, engineer, and customer)
        public static readonly string[] shopManagerAllowedRoles = {
            "customer_personnel",
            "engineer",
            "customer",
            "shop_tl"
        };

        public static bool isShopManagerAllowedRole(string role)
        {
            return shopManagerAllowedRoles.Contains(role);
        }

        // Valid personnel types for customer_personnel role
        public static readonly string[] ValidPersonnelTypes = {
            "customer_personnel",
            "technician",
            "tools_clerk",
            "warranty_officer"
        };

        public static bool IsValidPersonnelType(string? personnelType)
        {
            if (string.IsNullOrEmpty(personnelType)) return true; // null is valid (defaults to customer_personnel)
            return ValidPersonnelTypes.Contains(personnelType.ToLower().Trim());
        }

        // Roles that manager can create and manage - now includes shop_manager
        public static readonly string[] ManagerAllowedRoles = {
            "team_leader",
            "shop_tl",
            "engineer",
            "shop_manager"  // NEW
        };
        
        public static bool IsManagerAllowedRole(string role)
        {
            return ManagerAllowedRoles.Contains(role);
        }

        // Roles that can be assigned as managers
        public static readonly string[] ManagerEligibleRoles = {
            "manager",
            "director"
        };
        
        public static bool IsManagerEligibleRole(string role)
        {
            return ManagerEligibleRoles.Contains(role);
        }

        // UPDATED: Roles that admin can create - now includes shop_manager
        public static readonly string[] AdminAllowedRoles = {
            "director",
            "manager",
            "team_leader",
            "customer",
            "shop_manager"  // NEW
        };
        
        public static bool IsAdminAllowedRole(string role)
        {
            return AdminAllowedRoles.Contains(role);
        }
        
        // UPDATED: Roles that director can create - includes Manager, Customer, and optionally Team Leader
        public static string[] GetDirectorAllowedRoles(bool canCreateTeamLeader)
        {
            if (canCreateTeamLeader)
            {
                return new[] { "manager", "customer", "team_leader", "shop_manager" };
            }
            return new[] { "manager", "customer", "shop_manager" };
        }
        
        public static bool IsDirectorAllowedRole(string role, bool canCreateTeamLeader)
        {
            return GetDirectorAllowedRoles(canCreateTeamLeader).Contains(role);
        }
    }
}