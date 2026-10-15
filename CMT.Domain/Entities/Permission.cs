using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Entities
{
    public class Permission
    {
        [Key]
        public int PermissionId { get; set; }

        [Required]
        [StringLength(100)]
        public string Name { get; set; } = string.Empty;

        [StringLength(500)]
        public string? Description { get; set; }

        [Required]
        [StringLength(50)]
        public string Category { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }

        // Navigation properties
        public virtual ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
    }

    public class RolePermission
    {
        [Key]
        public int RolePermissionId { get; set; }

        [Required]
        public UserRole Role { get; set; }

        [Required]
        public int PermissionId { get; set; }

        public virtual Permission Permission { get; set; } = null!;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAt { get; set; }

        [StringLength(100)]
        public string? CreatedBy { get; set; }

        [StringLength(100)]
        public string? UpdatedBy { get; set; }
    }

    // Static permission constants
    public static class Permissions
    {
        // Task Management
        public const string CREATE_TASK = "create_task";
        public const string VIEW_ALL_TASKS = "view_all_tasks";
        public const string VIEW_OWN_TASKS = "view_own_tasks";
        public const string UPDATE_TASK_STATUS = "update_task_status";
        public const string DELETE_TASK = "delete_task";
        public const string ASSIGN_TASK = "assign_task";
        public const string COMPLETE_TASK = "complete_task";
        public const string REQUEST_AMENDMENT = "request_amendment";
        public const string APPROVE_AMENDMENT = "approve_amendment";

        // User Management
        public const string CREATE_USER = "create_user";
        public const string VIEW_ALL_USERS = "view_all_users";
        public const string UPDATE_USER = "update_user";
        public const string DELETE_USER = "delete_user";
        public const string MANAGE_ROLES = "manage_roles";

        // System Management
        public const string MANAGE_CATEGORIES = "manage_categories";
        public const string MANAGE_PRIORITIES = "manage_priorities";
        public const string VIEW_REPORTS = "view_reports";
        public const string EXPORT_DATA = "export_data";
        public const string SYSTEM_SETTINGS = "system_settings";

        // Performance & Analytics
        public const string VIEW_PERFORMANCE = "view_performance";
        public const string VIEW_TEAM_PERFORMANCE = "view_team_performance";
        public const string VIEW_ALL_PERFORMANCE = "view_all_performance";

        // Shop Management
        public const string MANAGE_SHOP_USERS = "manage_shop_users";
        public const string VIEW_SHOP_TASKS = "view_shop_tasks";
    }
}