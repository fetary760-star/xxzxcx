using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CMT.Domain.Models;

[Table("users")]
public class User : BaseEntity
{
    [Key]
    [Column("user_id")]
    public int UserId { get; set; }

    [Required]
    [StringLength(50)]
    [Column("username")]
    public string Username { get; set; } = string.Empty;

    [Required]
    [StringLength(255)]
    [Column("password")]
    public string Password { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [StringLength(20)]
    [Column("phone_number")]
    public string? PhoneNumber { get; set; }

    [Required]
    [StringLength(100)]
    [Column("full_name")]
    public string FullName { get; set; } = string.Empty;

    [Required]
    [Column("role")]
    public UserRole Role { get; set; }

    [Column("status")]
    public UserStatus Status { get; set; } = UserStatus.Active;

    [StringLength(255)]
    [Column("profile_picture_path")]
    public string? ProfilePicturePath { get; set; }

    [Column("supervisor_id")]
    public int? SupervisorId { get; set; }

    [Column("shop_id")]
    public int? ShopId { get; set; }

    // NEW: Department assignment
    [Column("department_id")]
    public int? DepartmentId { get; set; }

    // Track who created this user (for shop_tl tracking)
    [Column("created_by_user_id")]
    public int? CreatedByUserId { get; set; }

    // Manager ID for hierarchical management
    [Column("manager_id")]
    public int? ManagerId { get; set; }

    // Personnel type for customer_personnel role variations
    [StringLength(50)]
    [Column("personnel_type")]
    public string? PersonnelType { get; set; }

    [StringLength(255)]
    [Column("password_reset_token")]
    public string? PasswordResetToken { get; set; }

    [Column("password_reset_expires_at")]
    public DateTime? PasswordResetExpiresAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; }

    // NEW: Permission to create team leaders (for Director and Admin roles)
    [Column("can_create_team_leader")]
    public bool CanCreateTeamLeader { get; set; } = false;

    // Navigation properties
    public virtual User? Supervisor { get; set; }

    [ForeignKey("ShopId")]
    public virtual Shop? Shop { get; set; }

    // NEW: Department navigation
    [ForeignKey("DepartmentId")]
    public virtual Department? Department { get; set; }

    public virtual User? CreatedByUser { get; set; }

    public virtual User? Manager { get; set; }

    public virtual ICollection<Task> CreatedTasks { get; set; } = new List<Task>();
    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public virtual PerformanceMetric? PerformanceMetric { get; set; }

    [InverseProperty("CreatedByUser")]
    public virtual ICollection<User> CreatedUsers { get; set; } = new List<User>();

    [InverseProperty("Manager")]
    public virtual ICollection<User> ManagedUsers { get; set; } = new List<User>();

    [InverseProperty("Supervisor")]
    public virtual ICollection<User> SupervisedUsers { get; set; } = new List<User>();

    // NEW: Departments created by this Director
    [InverseProperty("Director")]
    public virtual ICollection<Department> CreatedDepartments { get; set; } = new List<Department>();

    // REMOVED: ManagedDepartments navigation property
    // The Department.Managers collection now uses Department navigation via DepartmentId
    // If you need to query departments managed by a user, use:
    // context.Departments.Where(d => d.Managers.Any(m => m.UserId == userId))
}

public enum UserRole
{
    [Display(Name = "Customer")]
    Customer = 1,
    
    [Display(Name = "Customer Personnel")]
    CustomerPersonnel = 2,
    
    [Display(Name = "Engineer")]
    Engineer = 3,
    
    [Display(Name = "Shop Team Leader")]
    ShopTL = 4,
    
    [Display(Name = "Team Leader")]
    TeamLeader = 5,
    
    [Display(Name = "Manager")]
    Manager = 6,
    
    [Display(Name = "Director")]
    Director = 7,
    
    [Display(Name = "Admin")]
    Admin = 8,

    // NEW: Shop Manager - limited Manager with shop-scoped access
    [Display(Name = "Shop Manager")]
    MiniManager = 9
}

public enum UserStatus
{
    Active,
    Inactive,
    Suspended
}

// Personnel type enum for customer_personnel role variations
public enum PersonnelType
{
    [Display(Name = "Customer Personnel")]
    CustomerPersonnel,
    
    [Display(Name = "Technician")]
    Technician,
    
    [Display(Name = "Tools Clerk")]
    ToolsClerk,

    [Display(Name = "Warranty Officer")]
    WarrantyOfficer
}